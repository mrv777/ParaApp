/**
 * AchievementsCard - Displays achievement badges (block-win medals + the
 * Refinery Operator badge) as a horizontal row. Tapping any badge opens a
 * shared detail sheet.
 */

import { ScrollView, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../Card';
import { Text } from '../Text';
import { SkeletonLoader } from '../SkeletonLoader';
import { BlockMedal, RefineryMedal } from './BadgeMedals';
import type { BadgeDetail } from './BadgeDetailSheet';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';
import type { UserRoundsResponse, UserRoundHistoryEntry } from '@/types';

export interface AchievementsCardProps {
  rounds: UserRoundsResponse | null;
  hasRefineryBadge?: boolean;
  isLoading?: boolean;
  className?: string;
  /** Called when a badge is tapped; the parent renders the detail sheet. */
  onBadgePress?: (badge: BadgeDetail) => void;
}

function entryToBadge(entry: UserRoundHistoryEntry): BadgeDetail {
  return {
    type: 'block',
    blockHeight: entry.block_height,
    rank: entry.rank,
    workRank: entry.work_rank,
    totalParticipants: entry.total_participants,
    topDiff: entry.top_diff,
    totalWork: entry.total_work,
    isWinner: entry.is_winner,
  };
}

export function AchievementsCard({
  rounds,
  hasRefineryBadge = false,
  isLoading = false,
  className = '',
  onBadgePress,
}: AchievementsCardProps) {
  const { t } = useTranslation();

  if (isLoading && !rounds) {
    return (
      <Card padding="sm" className={className}>
        <View className="flex-row items-center gap-2 mb-2">
          <Ionicons name="star-outline" size={18} color={colors.textMuted} />
          <Text variant="subtitle" className="text-base">
            {t('home.achievements')}
          </Text>
        </View>
        <View className="flex-row gap-2">
          <SkeletonLoader variant="circle" width={44} height={44} />
          <SkeletonLoader variant="circle" width={44} height={44} />
          <SkeletonLoader variant="circle" width={44} height={44} />
        </View>
      </Card>
    );
  }

  const hasBlockBadges = !!rounds && rounds.history.length > 0;
  const hasAnyBadge =
    hasRefineryBadge ||
    hasBlockBadges ||
    (!!rounds && rounds.rounds_won > 0);

  if (!hasAnyBadge) {
    return null;
  }

  return (
    <Card padding="sm" className={className}>
      {/* Header */}
      <View className="flex-row items-center gap-2 mb-3">
        <Ionicons name="star-outline" size={18} color={colors.textMuted} />
        <Text variant="subtitle" className="text-base">
          {t('home.achievements')}
        </Text>
      </View>

      {/* Badge row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {rounds?.history.map((entry) => (
          <Pressable
            key={entry.block_height}
            onPress={() => onBadgePress?.(entryToBadge(entry))}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <BlockMedal size={44} blockHeight={entry.block_height} />
          </Pressable>
        ))}

        {hasRefineryBadge && (
          <Pressable
            onPress={() => onBadgePress?.({ type: 'refinery' })}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <RefineryMedal size={44} />
          </Pressable>
        )}
      </ScrollView>
    </Card>
  );
}
