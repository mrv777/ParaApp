/**
 * PoolHashrateCard - Pool-wide hashrate hero + time range + chart. Mirrors the
 * Home screen's terminal/brutalist system: a POOL HASHRATE label over a large
 * value, a square 1h/24h/7d/30d segmented control, and a square hairline chart
 * card with faint dashed gridlines, a 4-label y-axis, and a ⤢ expand button in
 * the top-right that opens the full-screen chart.
 */

import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../Text';
import { TimePresetButtons, HashrateChart } from '../charts';
import { formatHashrate } from '@/utils/formatting';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';
import type { PoolHistoricalPoint, HistoricalPeriod } from '@/types';

const CHART_HEIGHT = 150;
const EMPTY_HISTORY: PoolHistoricalPoint[] = [];

/** Split "65.3 PH/s" into ["65.3", "PH/s"]. */
function splitHashrate(value: string): [string, string] {
  const idx = value.indexOf(' ');
  if (idx === -1) return [value, ''];
  return [value.slice(0, idx), value.slice(idx + 1)];
}

export interface PoolHashrateCardProps {
  hashrate?: number;
  period: HistoricalPeriod;
  historical?: PoolHistoricalPoint[];
  onPeriodChange: (period: HistoricalPeriod) => void;
  isLoadingHistorical?: boolean;
  onExpand?: () => void;
  className?: string;
}

export function PoolHashrateCard({
  hashrate,
  period,
  historical = EMPTY_HISTORY,
  onPeriodChange,
  isLoadingHistorical = false,
  onExpand,
  className = '',
}: PoolHashrateCardProps) {
  const { t } = useTranslation();

  const [heroValue, heroUnit] = hashrate
    ? splitHashrate(formatHashrate(hashrate))
    : ['--', ''];

  return (
    <View className={className}>
      {/* Label + value on the left; segmented control on the right */}
      <View className="flex-row items-end justify-between">
        <View>
          <Text
            variant="mono"
            className="uppercase"
            style={{ fontSize: 10, letterSpacing: 1.6, color: colors.textDim }}
          >
            {t('pool.hashrate')}
          </Text>
          <View className="flex-row items-baseline" style={{ marginTop: 5 }}>
            <Text
              variant="mono"
              className="font-bold text-foreground"
              style={{ fontSize: 30, lineHeight: 36 }}
            >
              {heroValue}
            </Text>
            {heroUnit ? (
              <Text
                variant="mono"
                style={{ fontSize: 16, color: colors.textMuted, marginLeft: 6 }}
              >
                {heroUnit}
              </Text>
            ) : null}
          </View>
        </View>

        <TimePresetButtons
          selected={period}
          onSelect={onPeriodChange}
          disabled={isLoadingHistorical}
        />
      </View>

      {/* Chart card */}
      <View
        className="border border-border relative"
        style={{
          backgroundColor: colors.card,
          paddingHorizontal: 12,
          paddingTop: 12,
          paddingBottom: 8,
          marginTop: 10,
        }}
      >
        <HashrateChart
          data={historical}
          period={period}
          isLoading={isLoadingHistorical}
          height={CHART_HEIGHT}
          variant="card"
        />

        {/* Rendered after the chart so it stacks on top (top-right corner). */}
        {onExpand && (
          <Pressable
            onPress={onExpand}
            hitSlop={8}
            className="absolute active:opacity-60"
            style={{
              top: 10,
              right: 10,
              zIndex: 10,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.14)',
              backgroundColor: colors.background,
              padding: 4,
            }}
          >
            <Ionicons name="expand-outline" size={13} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
    </View>
  );
}
