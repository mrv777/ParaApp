/**
 * AchievementsSheet - Bottom sheet listing the user's achievement badges
 * (block-win medals + the Refinery Operator badge). Opened from the "N BADGES"
 * footer inside the Mining Stats card. Tapping a badge hands it back to the
 * parent, which opens the shared BadgeDetailSheet.
 */

import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from '../Sheet';
import { Text } from '../Text';
import { BlockMedal, RefineryMedal } from './BadgeMedals';
import type { BadgeDetail } from './BadgeDetailSheet';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';
import type { UserRoundsResponse, UserRoundHistoryEntry } from '@/types';

export function entryToBadge(entry: UserRoundHistoryEntry): BadgeDetail {
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

export interface AchievementsSheetProps {
  visible: boolean;
  onClose: () => void;
  rounds: UserRoundsResponse | null;
  hasRefineryBadge?: boolean;
  onBadgePress: (badge: BadgeDetail) => void;
}

export function AchievementsSheet({
  visible,
  onClose,
  rounds,
  hasRefineryBadge = false,
  onBadgePress,
}: AchievementsSheetProps) {
  const { t } = useTranslation();
  const history = rounds?.history ?? [];

  return (
    <Sheet visible={visible} onClose={onClose} scrollable>
      <View className="flex-row items-center justify-between pb-4">
        <Text variant="subtitle" className="font-semibold">
          {t('home.achievements')}
        </Text>
        <Pressable onPress={onClose} className="p-2 -mr-2" hitSlop={8}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
      </View>

      <View className="flex-row flex-wrap" style={{ gap: 16 }}>
        {history.map((entry) => (
          <Pressable
            key={entry.block_height}
            onPress={() => onBadgePress(entryToBadge(entry))}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <BlockMedal size={56} blockHeight={entry.block_height} />
          </Pressable>
        ))}

        {hasRefineryBadge && (
          <Pressable
            onPress={() => onBadgePress({ type: 'refinery' })}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <RefineryMedal size={56} />
          </Pressable>
        )}
      </View>
    </Sheet>
  );
}
