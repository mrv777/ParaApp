/**
 * PoolStatsBar - Pinned pool-wide stats bar at the top of the home screen.
 * Pool hashrate is emphasized on the left; miners / workers / best diff sit
 * right-aligned as three secondary stats. Terminal/brutalist styling.
 */

import { View } from 'react-native';
import { Text } from '../Text';
import { formatHashrate, formatNumber } from '@/utils/formatting';
import { usePoolStore, selectPoolStats, selectIsPoolLoading } from '@/store/poolStore';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';

/** Split "83.8 PH/s" into ["83.8", "PH/s"]. */
function splitHashrate(hr: number): [string, string] {
  const formatted = formatHashrate(hr);
  const idx = formatted.indexOf(' ');
  if (idx === -1) return [formatted, ''];
  return [formatted.slice(0, idx), formatted.slice(idx + 1)];
}

interface SecondaryStatProps {
  label: string;
  value: string;
}

function SecondaryStat({ label, value }: SecondaryStatProps) {
  return (
    <View className="items-end">
      <Text
        variant="caption"
        className="uppercase"
        style={{ fontSize: 9, letterSpacing: 0.9, color: colors.textDim }}
      >
        {label}
      </Text>
      <Text
        variant="mono"
        className="font-bold"
        style={{ fontSize: 13, color: colors.textValue, marginTop: 3 }}
      >
        {value}
      </Text>
    </View>
  );
}

function SecondaryStatSkeleton() {
  return (
    <View className="items-end gap-1">
      <View className="w-8 h-2 bg-surface-elevated" />
      <View className="w-10 h-3.5 bg-surface-elevated" />
    </View>
  );
}

export interface PoolStatsBarProps {
  className?: string;
}

export function PoolStatsBar({ className = '' }: PoolStatsBarProps) {
  const { t } = useTranslation();
  const stats = usePoolStore(selectPoolStats);
  const isLoading = usePoolStore(selectIsPoolLoading);

  const showSkeleton = isLoading && !stats;
  const [poolValue, poolUnit] = stats?.hashrate
    ? splitHashrate(stats.hashrate)
    : ['--', ''];

  return (
    <View
      className={`flex-row items-end justify-between border-b border-border ${className}`}
      style={{ paddingTop: 8, paddingBottom: 12, paddingHorizontal: 20 }}
    >
      {/* Left — pool hashrate emphasized */}
      <View>
        <Text
          variant="caption"
          className="uppercase"
          style={{ fontSize: 9, letterSpacing: 1.26, color: colors.textDim }}
        >
          {t('home.poolHashrate')}
        </Text>
        <View className="flex-row items-baseline" style={{ marginTop: 4 }}>
          <Text
            variant="mono"
            className="font-bold text-foreground"
            style={{ fontSize: 22, lineHeight: 28 }}
          >
            {poolValue}
          </Text>
          {poolUnit ? (
            <Text
              variant="mono"
              style={{ fontSize: 13, color: colors.textMuted, marginLeft: 5 }}
            >
              {poolUnit}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Right — three secondary stats */}
      {showSkeleton ? (
        <View className="flex-row" style={{ gap: 14 }}>
          <SecondaryStatSkeleton />
          <SecondaryStatSkeleton />
          <SecondaryStatSkeleton />
        </View>
      ) : (
        <View className="flex-row" style={{ gap: 14 }}>
          <SecondaryStat
            label={t('home.minersLabel')}
            value={stats?.users ? formatNumber(stats.users) : '--'}
          />
          <SecondaryStat
            label={t('home.workersLabel')}
            value={stats?.workers ? formatNumber(stats.workers) : '--'}
          />
          <SecondaryStat
            label={t('home.bestDiffLabel')}
            value={stats?.highestDifficulty || '--'}
          />
        </View>
      )}
    </View>
  );
}
