/**
 * BadgeDetailSheet - Detail sheet shown when an achievement badge is tapped.
 * Displays an enlarged medal, contextual info, and action buttons.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { Sheet } from '../Sheet';
import { Text } from '../Text';
import { BlockMedal, RefineryMedal } from './BadgeMedals';
import { usePoolStore, selectRounds, isCacheStale } from '@/store';
import { haptics } from '@/utils/haptics';
import { colors } from '@/constants/colors';
import { formatDifficulty } from '@/utils/formatting';
import { formatWorkShare } from '@/utils/poolStats';
import { useTranslation } from '@/i18n';

export type BadgeDetail =
  | {
      type: 'block';
      blockHeight: number;
      rank: number;
      workRank: number;
      totalParticipants: number;
      topDiff: number;
      totalWork: number;
      isWinner: boolean;
    }
  | { type: 'refinery' };

export interface BadgeDetailSheetProps {
  visible: boolean;
  badge: BadgeDetail | null;
  onClose: () => void;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="items-center flex-1">
      <Text variant="subtitle" className="text-base">
        {value}
      </Text>
      <Text variant="caption" color="muted" className="mt-0.5">
        {label}
      </Text>
    </View>
  );
}

function ActionButton({
  onPress,
  icon,
  label,
  disabled,
}: {
  onPress: () => void;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className="flex-row items-center justify-center gap-2 py-3 rounded-lg bg-background border border-border"
      style={({ pressed }) => ({ opacity: disabled ? 0.5 : pressed ? 0.7 : 1 })}
    >
      <Ionicons name={icon} size={18} color={colors.text} />
      <Text variant="body" numberOfLines={1} className="font-medium">
        {label}
      </Text>
    </Pressable>
  );
}

export function BadgeDetailSheet({
  visible,
  badge,
  onClose,
}: BadgeDetailSheetProps) {
  const { t } = useTranslation();
  const shareRef = useRef<View>(null);
  const [isSharing, setIsSharing] = useState(false);
  // Retain the last badge so content stays stable during the close animation.
  const [displayBadge, setDisplayBadge] = useState<BadgeDetail | null>(badge);
  useEffect(() => {
    if (badge) setDisplayBadge(badge);
  }, [badge]);

  // Lazily fetch round summaries (winning diff per block) when a block badge
  // is shown; one cached fetch covers every badge.
  useEffect(() => {
    if (visible && displayBadge?.type === 'block') {
      const { rounds, isLoadingRounds, fetchRounds } = usePoolStore.getState();
      if (!isLoadingRounds && isCacheStale(rounds)) fetchRounds();
    }
  }, [visible, displayBadge]);

  const rounds = usePoolStore(selectRounds);
  // One lookup feeds both the winning diff and the miner's share of the block's
  // pool-wide work; the round is missing until /api/rounds resolves.
  const { winnerDiff, workShare } = useMemo(() => {
    if (displayBadge?.type !== 'block') return { winnerDiff: null, workShare: null };
    const round = rounds?.find((r) => r.block_height === displayBadge.blockHeight);
    return {
      winnerDiff: round?.winner_diff ?? null,
      workShare: formatWorkShare(displayBadge.totalWork, round?.total_work),
    };
  }, [rounds, displayBadge]);

  const handleShare = useCallback(async () => {
    if (!shareRef.current) return;
    setIsSharing(true);
    try {
      const uri = await captureRef(shareRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'Share Badge',
        });
        await haptics.success();
      }
    } catch (error) {
      // User cancellation is not an error
      if (!(error instanceof Error && error.message.includes('cancel'))) {
        await haptics.error();
      }
    } finally {
      setIsSharing(false);
    }
  }, []);

  const handleMempool = useCallback(() => {
    if (displayBadge?.type === 'block') {
      Linking.openURL(`https://mempool.space/block/${displayBadge.blockHeight}`);
    }
  }, [displayBadge]);

  const handleLearnMore = useCallback(() => {
    Linking.openURL('https://parasite.space');
  }, []);

  const title =
    displayBadge?.type === 'refinery'
      ? t('home.refineryOperator')
      : displayBadge?.type === 'block'
        ? t('home.blockBadgeTitle', { height: displayBadge.blockHeight })
        : '';

  return (
    <Sheet visible={visible} onClose={onClose}>
      {/* Header */}
      <View className="flex-row items-center justify-between pb-2">
        <Text variant="subtitle" className="font-semibold">
          {title}
        </Text>
        <Pressable onPress={onClose} className="p-2 -mr-2" hitSlop={8}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
      </View>

      {/* Medal + stats (capture target for sharing; needs an opaque
          background so the shared PNG has no transparent regions) */}
      <View
        ref={shareRef}
        collapsable={false}
        style={{
          backgroundColor: colors.surface,
          paddingBottom: 12,
        }}
      >
        <View
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.background,
            paddingVertical: 20,
          }}
        >
          {displayBadge?.type === 'refinery' ? (
            <RefineryMedal size={140} />
          ) : (
            <BlockMedal
              size={140}
              blockHeight={displayBadge?.blockHeight ?? 0}
            />
          )}
        </View>

        {/* Block round stats */}
        {displayBadge?.type === 'block' && (
          <>
            <View className="flex-row mt-4">
              <Stat
                label={t('home.badgeRank')}
                value={`#${displayBadge.rank}`}
              />
              <Stat
                label={t('home.workRank')}
                value={`#${displayBadge.workRank}`}
              />
              <Stat
                label={t('home.badgeParticipants')}
                value={`${displayBadge.totalParticipants}`}
              />
            </View>
            <View className="flex-row mt-3">
              <Stat
                label={t('home.badgeTopDiff')}
                value={formatDifficulty(displayBadge.topDiff)}
              />
              <Stat
                label={t('home.colWork')}
                value={formatDifficulty(displayBadge.totalWork)}
              />
              <Stat
                label={t('home.badgeWinnerDiff')}
                value={winnerDiff != null ? formatDifficulty(winnerDiff) : '--'}
              />
            </View>
            {workShare && (
              <Text variant="caption" align="center" color="muted" className="mt-3">
                {t('home.badgeWorkShare', { share: workShare })}
              </Text>
            )}
            <Text
              variant="caption"
              align="center"
              color={displayBadge.isWinner ? 'success' : 'muted'}
              className="mt-3"
            >
              {displayBadge.isWinner
                ? t('home.badgeWon')
                : t('home.badgeParticipated')}
            </Text>
          </>
        )}
      </View>

      {/* Refinery description */}
      {displayBadge?.type === 'refinery' && (
        <Text variant="body" color="muted" align="center" className="mt-4 px-2">
          {t('home.refineryOperatorDesc')}
        </Text>
      )}

      {/* Actions (stacked full-width so long/localized labels always fit) */}
      <View className="gap-3 mt-6">
        {displayBadge?.type === 'block' && (
          <ActionButton
            onPress={handleMempool}
            icon="open-outline"
            label={t('home.viewOnMempool')}
          />
        )}
        {displayBadge?.type === 'refinery' && (
          <ActionButton
            onPress={handleLearnMore}
            icon="open-outline"
            label={t('home.learnMore')}
          />
        )}
        <ActionButton
          onPress={handleShare}
          icon="share-outline"
          label={t('common.share')}
          disabled={isSharing}
        />
      </View>
    </Sheet>
  );
}
