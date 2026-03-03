/**
 * PoolStatsGrid component - 2-column grid of pool statistics
 */

import { View } from 'react-native';
import { StatItem } from '../StatItem';
import { SkeletonStatItem } from '../SkeletonLoader';
import { formatNumber, formatDifficulty } from '@/utils/formatting';
import { useTranslation } from '@/i18n';
import type { PoolStats } from '@/types';

export interface PoolStatsGridProps {
  stats: PoolStats | null;
  bitcoinPrice: number | null;
  isLoading?: boolean;
  className?: string;
}

export function PoolStatsGrid({
  stats,
  bitcoinPrice,
  isLoading = false,
  className = '',
}: PoolStatsGridProps) {
  const { t } = useTranslation();

  // Show skeleton when loading with no data
  if (isLoading && !stats) {
    return (
      <View className={`flex-row flex-wrap -mx-2 ${className}`}>
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={i} className="w-1/2 px-2 mb-4">
            <SkeletonStatItem />
          </View>
        ))}
      </View>
    );
  }

  // Last block is now a block height string (e.g., "938713"), or null
  const lastBlockHeight = stats?.lastBlockTime;

  // Parse highest difficulty - could be string like "1.23M" or number
  const highestDiff = stats?.highestDifficulty ?? '--';

  return (
    <View className={`flex-row flex-wrap -mx-2 ${className}`}>
      <View className="w-1/2 px-2 mb-4">
        <StatItem
          icon="people-outline"
          label={t('pool.users')}
          value={formatNumber(stats?.users ?? 0)}
        />
      </View>
      <View className="w-1/2 px-2 mb-4">
        <StatItem
          icon="hardware-chip-outline"
          label={t('pool.workers')}
          value={formatNumber(stats?.workers ?? 0)}
        />
      </View>
      <View className="w-1/2 px-2 mb-4">
        <StatItem
          icon="cube-outline"
          label={t('pool.lastBlock')}
          value={lastBlockHeight ? `#${lastBlockHeight}` : '--'}
        />
      </View>
      <View className="w-1/2 px-2 mb-4">
        <StatItem
          icon="hourglass-outline"
          label={t('pool.uptime')}
          value={stats?.uptime ?? '--'}
        />
      </View>
      <View className="w-1/2 px-2 mb-4">
        <StatItem
          icon="logo-bitcoin"
          label={t('pool.btcPrice')}
          value={bitcoinPrice ? `$${formatNumber(bitcoinPrice, 0)}` : '--'}
        />
      </View>
      <View className="w-1/2 px-2 mb-4">
        <StatItem
          icon="trending-up-outline"
          label={t('pool.highestDiff')}
          value={
            typeof highestDiff === 'number'
              ? formatDifficulty(highestDiff)
              : highestDiff
          }
        />
      </View>
    </View>
  );
}
