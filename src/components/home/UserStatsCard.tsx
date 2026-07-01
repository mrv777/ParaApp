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
  workRank?: number | null;
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
  workRank,
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
        <View className="flex-row items-center gap-2">
          <Ionicons name="speedometer-outline" size={18} color={colors.textMuted} />
          <Text variant="subtitle" className="text-base">
            {t('home.miningStats')}
          </Text>
        </View>
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
            <View className="flex-1">
              <SkeletonStatItem />
            </View>
          </View>
        </View>
      ) : (
        <View className="gap-3">
          {/* Primary hashrate — hero size (inline fontSize so it reliably wins
              over the mono Text variant's base size) */}
          <View className="gap-1">
            <Text variant="caption" className="text-base">
              {t('home.currentHashrate')}
            </Text>
            <Text
              variant="mono"
              className="font-bold text-foreground"
              style={{ fontSize: 26, lineHeight: 32 }}
            >
              {stats?.hashrate ? formatHashrate(stats.hashrate) : '--'}
            </Text>
          </View>

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

          {/* Leaderboard ranks row (no icons — keeps long labels on one line) */}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <StatItem
                label={t('home.difficultyRank')}
                value={formatRank(difficultyRank)}
                size="sm"
              />
            </View>
            <View className="flex-1">
              <StatItem
                label={t('home.workRank')}
                value={formatRank(workRank)}
                size="sm"
              />
            </View>
            <View className="flex-1">
              <StatItem
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
