/**
 * PoolHashrateCard - Pool-wide hashrate hero + time range + chart. Mirrors the
 * Home screen's UserStatsCard: a single hairline Card holding a POOL HASHRATE
 * label with the 1h/24h/7d/30d segmented control on the same row, a large value
 * beneath, and an embedded hashrate chart (faint dashed gridlines, 4-label
 * y-axis) that opens the full-screen chart when tapped.
 */

import { View, Pressable } from 'react-native';
import { Card } from '../Card';
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
    <Card padding="none" className={className}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        {/* Label + segmented control on one row (matches Home) */}
        <View className="flex-row items-center justify-between">
          <Text
            variant="mono"
            className="uppercase"
            style={{ fontSize: 10, letterSpacing: 1.6, color: colors.textDim }}
          >
            {t('pool.hashrate')}
          </Text>
          <TimePresetButtons
            selected={period}
            onSelect={onPeriodChange}
            disabled={isLoadingHistorical}
          />
        </View>

        {/* Hero value */}
        <View className="flex-row items-baseline" style={{ marginTop: 6 }}>
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

        {/* Embedded chart — tap anywhere opens the full-screen interactive chart.
            pointerEvents="none" lets the tap fall through to the Pressable and
            keeps the chart from showing its own clipped tooltip. */}
        <Pressable onPress={onExpand} style={{ marginTop: 12 }}>
          <View pointerEvents="none">
            <HashrateChart
              data={historical}
              period={period}
              isLoading={isLoadingHistorical}
              height={CHART_HEIGHT}
              variant="card"
            />
          </View>
        </Pressable>
      </View>
    </Card>
  );
}
