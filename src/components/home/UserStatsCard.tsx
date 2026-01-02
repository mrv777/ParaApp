/**
 * UserStatsCard - Displays user hashrate stats when address is configured
 */

import { View } from 'react-native';
import { Card } from '../Card';
import { Text } from '../Text';
import { StatItem } from '../StatItem';
import { SkeletonStatItem } from '../SkeletonLoader';
import { formatHashrate } from '@/utils/formatting';
import type { UserStats } from '@/types';

export interface UserStatsCardProps {
  stats: UserStats | null;
  difficultyRank?: number | null;
  loyaltyRank?: number | null;
  isLoading?: boolean;
  className?: string;
}

const formatRank = (rank: number | null | undefined): string => {
  if (rank == null) return '--';
  return `#${rank}`;
};

export function UserStatsCard({
  stats,
  difficultyRank,
  loyaltyRank,
  isLoading = false,
  className = '',
}: UserStatsCardProps) {
  const showSkeleton = isLoading && !stats;

  return (
    <Card padding="sm" className={className}>
      <Text variant="subtitle" className="mb-2 text-base">
        Mining Stats
      </Text>

      {showSkeleton ? (
        <View className="gap-3">
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
          <View className="flex-row gap-3">
            <View className="flex-1">
              <SkeletonStatItem />
            </View>
            <View className="flex-1">
              <SkeletonStatItem />
            </View>
          </View>
        </View>
      ) : (
        <View className="gap-3">
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
                value={stats?.bestDifficultyFormatted || '--'}
                size="sm"
              />
            </View>
          </View>

          {/* Leaderboard ranks row */}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <StatItem
                icon="trophy-outline"
                label="Difficulty Rank"
                value={formatRank(difficultyRank)}
                size="sm"
              />
            </View>
            <View className="flex-1">
              <StatItem
                icon="medal-outline"
                label="Loyalty Rank"
                value={formatRank(loyaltyRank)}
                size="sm"
              />
            </View>
          </View>
        </View>
      )}
    </Card>
  );
}
