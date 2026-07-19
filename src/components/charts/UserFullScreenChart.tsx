/**
 * UserFullScreenChart component - Full-screen modal for user hashrate chart
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, View, type GestureResponderEvent } from 'react-native';

import { FullScreenChartModal } from './FullScreenChartModal';
import { UserHashrateChart } from './UserHashrateChart';
import {
  getDifficultyHitPosition,
  getHighestDifficultyHit,
  getNearestDifficultyHit,
  selectVisibleDifficultyHits,
  supportsDifficultyHits,
} from './difficultyHits';
import { Text } from '../Text';
import { colors } from '@/constants/colors';
import { formatDifficulty } from '@/utils/formatting';
import { haptics } from '@/utils/haptics';
import { useTranslation } from '@/i18n';
import type { UserDifficultyHit, UserHistoricalPoint, HistoricalPeriod } from '@/types';

export interface UserFullScreenChartProps {
  visible: boolean;
  onClose: () => void;
  data: UserHistoricalPoint[];
  difficultyHits?: UserDifficultyHit[];
  currentHashrate?: number;
  period: HistoricalPeriod;
  onPeriodChange: (period: HistoricalPeriod) => void;
  isLoading?: boolean;
}

interface DifficultyHitRailProps {
  hits: UserDifficultyHit[];
  historical: UserHistoricalPoint[];
  selectedHit: UserDifficultyHit;
  onSelect: (hit: UserDifficultyHit) => void;
  label: string;
  instruction: string;
}

function DifficultyHitRail({
  hits,
  historical,
  selectedHit,
  onSelect,
  label,
  instruction,
}: DifficultyHitRailProps) {
  const [width, setWidth] = useState(0);
  const ticks = useMemo(() => {
    const positioned: { hit: UserDifficultyHit; position: number }[] = [];
    for (const hit of hits) {
      const position = getDifficultyHitPosition(hit, historical);
      if (position !== null) positioned.push({ hit, position });
    }
    return positioned;
  }, [hits, historical]);

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      if (width <= 0) return;
      const hit = getNearestDifficultyHit(hits, historical, event.nativeEvent.locationX / width);
      if (hit) onSelect(hit);
    },
    [width, hits, historical, onSelect]
  );

  return (
    <View style={{ marginTop: 8 }}>
      <View className="flex-row items-center justify-between" style={{ marginBottom: 3 }}>
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: colors.chartDifficulty,
            }}
          />
          <Text
            variant="caption"
            className="uppercase"
            style={{ color: colors.textMuted, fontSize: 10, letterSpacing: 1 }}
          >
            {label}
          </Text>
        </View>
        <Text variant="caption" style={{ color: colors.textFaint, fontSize: 10 }}>
          {instruction}
        </Text>
      </View>
      <Pressable
        accessible
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${instruction}`}
        onPress={handlePress}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={{ height: 36, marginLeft: 55, marginRight: 15 }}
      >
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 17,
            height: 1,
            backgroundColor: colors.border,
          }}
        />
        {ticks.map(({ hit, position }) => {
          const selected = hit.blockHeight === selectedHit.blockHeight;
          return (
            <View
              key={`${hit.blockHeight}-${hit.timestamp}`}
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: `${position * 100}%`,
                top: selected ? 7 : 11,
                width: selected ? 5 : 3,
                height: selected ? 22 : 14,
                transform: [{ translateX: selected ? -2.5 : -1.5 }],
                backgroundColor: colors.chartDifficulty,
                opacity: selected ? 1 : 0.65,
              }}
            />
          );
        })}
      </Pressable>
    </View>
  );
}

export function UserFullScreenChart(props: UserFullScreenChartProps) {
  const { t } = useTranslation();
  const [selectedHit, setSelectedHit] = useState<UserDifficultyHit | null>(null);
  const visibleHits = useMemo(
    () => selectVisibleDifficultyHits(props.difficultyHits ?? [], props.data, props.period),
    [props.difficultyHits, props.data, props.period]
  );

  // A new period or refreshed series starts with its strongest visible hit.
  useEffect(() => {
    setSelectedHit(getHighestDifficultyHit(visibleHits));
  }, [visibleHits]);

  const handleHitSelect = useCallback((hit: UserDifficultyHit) => {
    haptics.selection();
    setSelectedHit(hit);
  }, []);

  const chartAccessory = !supportsDifficultyHits(props.period) ? (
    <View
      className="border border-border"
      style={{ marginTop: 8, paddingHorizontal: 12, paddingVertical: 9 }}
    >
      <Text variant="caption" style={{ color: colors.textMuted, fontSize: 11 }}>
        {t('home.bestDiffShortRangeNote')}
      </Text>
    </View>
  ) : selectedHit && visibleHits.length > 0 ? (
    <View>
      <DifficultyHitRail
        hits={visibleHits}
        historical={props.data}
        selectedHit={selectedHit}
        onSelect={handleHitSelect}
        label={t('home.bestDiff')}
        instruction={t('home.tapDifficultyTimeline')}
      />
      <View
        accessible
        accessibilityLabel={t('home.bestDiffHitAccessibility', {
          diff: formatDifficulty(selectedHit.difficulty),
          block: selectedHit.blockHeight,
          time: new Date(selectedHit.timestamp).toLocaleString(),
        })}
        className="flex-row items-center border border-border"
        style={{ paddingHorizontal: 12, paddingVertical: 8, gap: 18 }}
      >
        <View style={{ flex: 1 }}>
          <Text variant="mono" style={{ color: colors.text, fontSize: 19 }}>
            {formatDifficulty(selectedHit.difficulty)}
          </Text>
        </View>
        <View>
          <Text variant="caption" style={{ color: colors.textMuted, fontSize: 10 }}>
            {t('home.blockNumber', { height: selectedHit.blockHeight })}
          </Text>
          <Text variant="mono" style={{ color: colors.textValue, fontSize: 11 }} numberOfLines={1}>
            {new Date(selectedHit.timestamp).toLocaleString()}
          </Text>
        </View>
      </View>
    </View>
  ) : undefined;

  return (
    <FullScreenChartModal
      {...props}
      title={t('home.hashrateAndBestDiff')}
      chartAccessory={chartAccessory}
      renderChart={({ data, height }) => (
        <UserHashrateChart
          data={data}
          period={props.period}
          isLoading={props.isLoading}
          height={height}
          className="flex-1"
        />
      )}
    />
  );
}
