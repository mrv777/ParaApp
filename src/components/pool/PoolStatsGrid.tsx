/**
 * PoolStatsGrid component - 2-column grid of pool statistics
 */

import { View } from 'react-native';
import { StatItem } from '../StatItem';
import { SkeletonStatItem } from '../SkeletonLoader';
import {
  formatNumber,
  formatTimestamp,
  formatDifficulty,
} from '@/utils/formatting';
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

  // Parse last block time
  const lastBlockTimestamp = stats?.lastBlockTime
    ? new Date(stats.lastBlockTime).getTime()
    : null;

  // Parse highest difficulty - could be string like "1.23M" or number
  const highestDiff = stats?.highestDifficulty ?? '--';

  return (
    <View className={`flex-row flex-wrap -mx-2 ${className}`}>
      <View className="w-1/2 px-2 mb-4">
        <StatItem
          icon="people-outline"
          label="Users"
          value={formatNumber(stats?.users ?? 0)}
        />
      </View>
      <View className="w-1/2 px-2 mb-4">
        <StatItem
          icon="hardware-chip-outline"
          label="Workers"
          value={formatNumber(stats?.workers ?? 0)}
        />
      </View>
      <View className="w-1/2 px-2 mb-4">
        <StatItem
          icon="time-outline"
          label="Last Block"
          value={lastBlockTimestamp ? formatTimestamp(lastBlockTimestamp) : '--'}
        />
      </View>
      <View className="w-1/2 px-2 mb-4">
        <StatItem
          icon="hourglass-outline"
          label="Uptime"
          value={stats?.uptime ?? '--'}
        />
      </View>
      <View className="w-1/2 px-2 mb-4">
        <StatItem
          icon="logo-bitcoin"
          label="BTC Price"
          value={bitcoinPrice ? `$${formatNumber(bitcoinPrice, 0)}` : '--'}
        />
      </View>
      <View className="w-1/2 px-2 mb-4">
        <StatItem
          icon="trending-up-outline"
          label="Highest Diff"
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
