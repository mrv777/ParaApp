/**
 * AchievementsSheet - Bottom sheet listing the user's achievement badges from
 * the server-computed badges payload (block/winner medals + stacking medals).
 * Opened from the "N BADGES" footer inside the Mining Stats card. Tapping a
 * badge hands it back to the parent, which opens the shared BadgeDetailSheet.
 */

import { useMemo } from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from '../Sheet';
import { Text } from '../Text';
import { BadgeMedal } from './BadgeMedals';
import type { BadgeDetail } from './BadgeDetailSheet';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';
import {
  buildBadgeMedals,
  extractBadgeCounts,
  type BadgeMedalDescriptor,
  type BadgesPayload,
  type UserRoundsResponse,
} from '@/types';

/**
 * Turn a row descriptor into the detail-sheet model, enriching block medals
 * with per-round stats when the block is in the fetched rounds history.
 */
export function descriptorToBadge(
  descriptor: BadgeMedalDescriptor,
  rounds: UserRoundsResponse | null
): BadgeDetail {
  if (descriptor.type === 'stacked') {
    return { type: 'stacked', kind: descriptor.kind, count: descriptor.count };
  }
  const entry = rounds?.history.find((h) => h.block_height === descriptor.blockHeight);
  return {
    type: 'block',
    blockHeight: descriptor.blockHeight,
    isWinner: descriptor.type === 'winner' || entry?.is_winner === true,
    round: entry
      ? {
          rank: entry.rank,
          workRank: entry.work_rank,
          totalParticipants: entry.total_participants,
          topDiff: entry.top_diff,
          totalWork: entry.total_work,
        }
      : undefined,
  };
}

export interface AchievementsSheetProps {
  visible: boolean;
  onClose: () => void;
  badges: BadgesPayload | null;
  /** Enriches block medals with per-round rank/work stats when available. */
  rounds: UserRoundsResponse | null;
  onBadgePress: (badge: BadgeDetail) => void;
}

export function AchievementsSheet({
  visible,
  onClose,
  badges,
  rounds,
  onBadgePress,
}: AchievementsSheetProps) {
  const { t } = useTranslation();
  const medals = useMemo(() => buildBadgeMedals(extractBadgeCounts(badges)), [badges]);

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
        {medals.map((descriptor) => (
          <Pressable
            key={descriptor.key}
            onPress={() => onBadgePress(descriptorToBadge(descriptor, rounds))}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <BadgeMedal descriptor={descriptor} size={56} />
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}
