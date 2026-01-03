/**
 * PoolStatsBar - Compact horizontal bar showing pool-wide stats
 * Always visible at top of home screen
 */

import { View } from 'react-native';
import { Text } from '../Text';
import { formatHashrate, formatNumber } from '@/utils/formatting';
import { usePoolStore, selectPoolStats, selectIsPoolLoading } from '@/store/poolStore';
import { useTranslation } from '@/i18n';

interface MiniStatProps {
  label: string;
  value: string | number;
}

function MiniStat({ label, value }: MiniStatProps) {
  return (
    <View className="items-center">
      <Text variant="caption" color="muted" className="text-[10px] uppercase">
        {label}
      </Text>
      <Text variant="mono" className="text-sm font-semibold">
        {value}
      </Text>
    </View>
  );
}

function MiniStatSkeleton() {
  return (
    <View className="items-center gap-0.5">
      <View className="w-8 h-2.5 bg-secondary rounded" />
      <View className="w-12 h-4 bg-secondary rounded" />
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

  return (
    <View className={`flex-row justify-between px-4 py-3 border-b border-border/50 ${className}`}>
      {showSkeleton ? (
        <>
          <MiniStatSkeleton />
          <MiniStatSkeleton />
          <MiniStatSkeleton />
          <MiniStatSkeleton />
        </>
      ) : (
        <>
          <MiniStat
            label={t('home.pool')}
            value={stats?.hashrate ? formatHashrate(stats.hashrate) : '--'}
          />
          <MiniStat
            label={t('home.minersLabel')}
            value={stats?.users ? formatNumber(stats.users) : '--'}
          />
          <MiniStat
            label={t('home.workersLabel')}
            value={stats?.workers ? formatNumber(stats.workers) : '--'}
          />
          <MiniStat
            label={t('home.bestDiffLabel')}
            value={stats?.highestDifficulty || '--'}
          />
        </>
      )}
    </View>
  );
}
