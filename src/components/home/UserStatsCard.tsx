/**
 * UserStatsCard - Displays user hashrate stats when address is configured
 */

import { View, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../Card';
import { Text } from '../Text';
import { StatItem } from '../StatItem';
import { SkeletonStatItem } from '../SkeletonLoader';
import { formatHashrate } from '@/utils/formatting';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';
import type { UserStats } from '@/types';

export interface UserStatsCardProps {
  stats: UserStats | null;
  difficultyRank?: number | null;
  loyaltyRank?: number | null;
  isLoading?: boolean;
  className?: string;
  onShare?: () => void;
  isSharing?: boolean;
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
  onShare,
  isSharing = false,
}: UserStatsCardProps) {
  const { t } = useTranslation();
  const showSkeleton = isLoading && !stats;

  return (
    <Card padding="sm" className={className}>
      <View className="mb-2 flex-row items-center justify-between">
        <Text variant="subtitle" className="text-base">
          {t('home.miningStats')}
        </Text>
        {onShare && (
          <Pressable
            onPress={onShare}
            disabled={isSharing || showSkeleton}
            hitSlop={8}
            className="active:opacity-60"
          >
            {isSharing ? (
              <ActivityIndicator size="small" color={colors.textMuted} />
            ) : (
              <Ionicons
                name="share-outline"
                size={20}
                color={showSkeleton ? colors.textDisabled : colors.textMuted}
              />
            )}
          </Pressable>
        )}
      </View>

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
            label={t('home.currentHashrate')}
            value={stats?.hashrate ? formatHashrate(stats.hashrate) : '--'}
            size="lg"
          />

          {/* Secondary stats row */}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <StatItem
                label={t('home.avg1h')}
                value={stats?.hashrate1h ? formatHashrate(stats.hashrate1h) : '--'}
                size="sm"
              />
            </View>
            <View className="flex-1">
              <StatItem
                label={t('home.avg24h')}
                value={stats?.hashrate24h ? formatHashrate(stats.hashrate24h) : '--'}
                size="sm"
              />
            </View>
            <View className="flex-1">
              <StatItem
                label={t('home.bestDiff')}
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
                label={t('home.difficultyRank')}
                value={formatRank(difficultyRank)}
                size="sm"
              />
            </View>
            <View className="flex-1">
              <StatItem
                icon="medal-outline"
                label={t('home.loyaltyRank')}
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
