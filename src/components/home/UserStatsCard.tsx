/**
 * UserStatsCard - Displays user hashrate stats when address is configured
 */

import { View } from 'react-native';
import { Card } from '../Card';
import { Text } from '../Text';
import { StatItem } from '../StatItem';
import { SkeletonStatItem } from '../SkeletonLoader';
import { formatHashrate, formatDifficulty } from '@/utils/formatting';
import type { UserStats } from '@/types';

export interface UserStatsCardProps {
  stats: UserStats | null;
  isLoading?: boolean;
  className?: string;
}

export function UserStatsCard({ stats, isLoading = false, className = '' }: UserStatsCardProps) {
  const showSkeleton = isLoading && !stats;

  return (
    <Card className={className}>
      <Text variant="subtitle" className="mb-4">
        Your Mining Stats
      </Text>

      {showSkeleton ? (
        <View className="gap-4">
          <SkeletonStatItem />
          <View className="flex-row gap-3">
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
        </View>
      ) : (
        <View className="gap-4">
          {/* Primary hashrate */}
          <StatItem
            icon="speedometer-outline"
            label="Current Hashrate"
            value={stats?.hashrate ? formatHashrate(stats.hashrate) : '--'}
            size="lg"
          />

          {/* Secondary stats row */}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <StatItem
                label="1h Average"
                value={stats?.hashrate1h ? formatHashrate(stats.hashrate1h) : '--'}
                size="sm"
              />
            </View>
            <View className="flex-1">
              <StatItem
                label="24h Average"
                value={stats?.hashrate24h ? formatHashrate(stats.hashrate24h) : '--'}
                size="sm"
              />
            </View>
            <View className="flex-1">
              <StatItem
                label="Best Diff"
                value={stats?.bestDifficulty ? formatDifficulty(stats.bestDifficulty) : '--'}
                size="sm"
              />
            </View>
          </View>
        </View>
      )}
    </Card>
  );
}
