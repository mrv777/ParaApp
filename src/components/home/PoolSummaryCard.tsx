/**
 * PoolSummaryCard - Displays pool stats preview when no address is configured
 */

import { View } from 'react-native';
import { Card } from '../Card';
import { Text } from '../Text';
import { StatItem } from '../StatItem';
import { SkeletonStatItem } from '../SkeletonLoader';
import { formatHashrate, formatNumber } from '@/utils/formatting';
import type { PoolStats } from '@/types';

export interface PoolSummaryCardProps {
  stats: PoolStats | null;
  isLoading?: boolean;
  className?: string;
}

export function PoolSummaryCard({ stats, isLoading = false, className = '' }: PoolSummaryCardProps) {
  const showSkeleton = isLoading && !stats;

  return (
    <Card className={className}>
      <Text variant="subtitle" className="mb-4">
        Pool Overview
      </Text>

      {showSkeleton ? (
        <View className="flex-row justify-between gap-3">
          <View className="flex-1">
            <SkeletonStatItem />
          </View>
          <View className="flex-1">
            <SkeletonStatItem />
          </View>
          <View className="flex-1">
            <SkeletonStatItem />
          </View>
        </View>
      ) : (
        <View className="flex-row justify-between gap-3">
          <View className="flex-1">
            <StatItem
              label="Pool Hashrate"
              value={stats?.hashrate ? formatHashrate(stats.hashrate) : '--'}
              size="sm"
            />
          </View>
          <View className="flex-1">
            <StatItem
              label="Users"
              value={stats?.users ? formatNumber(stats.users) : '--'}
              size="sm"
            />
          </View>
          <View className="flex-1">
            <StatItem
              label="Workers"
              value={stats?.workers ? formatNumber(stats.workers) : '--'}
              size="sm"
            />
          </View>
        </View>
      )}
    </Card>
  );
}
