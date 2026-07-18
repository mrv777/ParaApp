/**
 * LeaderboardCard - Ranked pool members (terminal/brutalist). A self-contained
 * square card: one header row (title + Since block / All-time switch), one
 * segmented control (Top Diff / Blocks Participated), a "Top N · members" hint +
 * Jump-to-you control, a bounded internally-scrolling list of clean rows (rank +
 * middle-truncated address + value, no per-row bar), and a pinned, always-
 * visible "You" footer.
 *
 * The row list is a plain bounded ScrollView rather than a FlatList: a
 * VirtualizedList (FlatList / FlashList / Legend List) nested inside the Pool
 * screen's outer ScrollView triggers RN's "nested VirtualizedList" warning and
 * breaks windowing. At <=420 lightweight rows a bounded ScrollView is fine and
 * keeps the "You" row pinned + Best Shares directly below the card.
 */

import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '@/i18n';
import { Text } from '../Text';
import { SkeletonLoader } from '../SkeletonLoader';
import { truncateAddress, formatDifficulty, formatNumber } from '@/utils/formatting';
import { addressMatches } from '@/utils/address';
import { haptics } from '@/utils/haptics';
import { colors } from '@/constants/colors';
import { useSettingsStore, selectRoundMode } from '@/store/settingsStore';
import type { RoundMode } from '@/store/settingsStore';
import type {
  DifficultyLeaderboardEntry,
  LoyaltyLeaderboardEntry,
  RoundWorkLeaderboardEntry,
} from '@/types';

type LeaderboardMetric = 'difficulty' | 'loyalty' | 'work';
type Entry =
  | DifficultyLeaderboardEntry
  | LoyaltyLeaderboardEntry
  | RoundWorkLeaderboardEntry;

const ROW_HEIGHT = 42;
// Bounded viewport (~7 rows) so the list scrolls internally and the "You" footer
// pins directly beneath it, keeping Best Shares reachable just below the card.
const LIST_MAX_HEIGHT = ROW_HEIGHT * 7;

export interface LeaderboardCardProps {
  difficultyEntries: DifficultyLeaderboardEntry[];
  loyaltyEntries: LoyaltyLeaderboardEntry[];
  roundDifficultyEntries?: DifficultyLeaderboardEntry[];
  roundLoyaltyEntries?: LoyaltyLeaderboardEntry[];
  roundWorkEntries?: RoundWorkLeaderboardEntry[];
  userAddress?: string;
  /** Approximate total member count for the informational "· N members" hint. */
  totalMembers?: number;
  isLoading?: boolean;
  className?: string;
}

function formatValue(metric: LeaderboardMetric, entry: Entry): string {
  if (metric === 'difficulty') {
    return formatDifficulty((entry as DifficultyLeaderboardEntry).diff);
  }
  if (metric === 'work') {
    return formatDifficulty((entry as RoundWorkLeaderboardEntry).total_work);
  }
  return formatNumber((entry as LoyaltyLeaderboardEntry).total_blocks);
}

/** Text switch item (Since block / All-time). Active = white with underline. */
function TextSwitch({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={6} className="active:opacity-60">
      <Text
        variant="mono"
        style={{
          fontSize: 11,
          color: active ? colors.text : colors.textDim,
          borderBottomWidth: active ? 1 : 0,
          borderBottomColor: colors.text,
          paddingBottom: 2,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** One segment of the metric control. Active = black text on light fill. */
function Segment({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: 7,
        backgroundColor: active ? colors.primary : 'transparent',
      }}
    >
      <Text
        variant="mono"
        style={{ fontSize: 11, textAlign: 'center', color: active ? '#000000' : colors.textDim }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * One leaderboard row: rank + middle-truncated address + value. No bar.
 * Memoized on its primitive props so unrelated parent re-renders (e.g. the ~10s
 * silent pool-stats poll) don't reconcile all up-to-420 rows.
 */
const Row = memo(function Row({
  rank,
  label,
  value,
  isUser,
}: {
  rank: string;
  label: string;
  value: string;
  isUser: boolean;
}) {
  return (
    <View
      className="flex-row items-center justify-between border-t border-border-light"
      style={{ height: ROW_HEIGHT, paddingHorizontal: 14 }}
    >
      <View className="flex-row items-center" style={{ flex: 1, gap: 12 }}>
        <Text variant="mono" style={{ fontSize: 12, color: colors.textDim, width: 36 }}>
          {rank}
        </Text>
        <Text
          variant="mono"
          style={{ fontSize: 13, color: isUser ? colors.text : colors.textValue, flexShrink: 1 }}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
      <Text variant="mono" className="font-bold text-foreground" style={{ fontSize: 13 }}>
        {value}
      </Text>
    </View>
  );
});

export function LeaderboardCard({
  difficultyEntries,
  loyaltyEntries,
  roundDifficultyEntries,
  roundLoyaltyEntries,
  roundWorkEntries,
  userAddress,
  totalMembers,
  isLoading = false,
  className = '',
}: LeaderboardCardProps) {
  const { t } = useTranslation();
  const [metric, setMetric] = useState<LeaderboardMetric>('difficulty');
  const roundMode = useSettingsStore(selectRoundMode);
  const setRoundModeStore = useSettingsStore((s) => s.setRoundMode);
  const scrollRef = useRef<ScrollView>(null);

  const handleMetric = useCallback((m: LeaderboardMetric) => {
    haptics.selection();
    setMetric(m);
  }, []);

  const handleTimeframe = useCallback(
    (mode: RoundMode) => {
      haptics.selection();
      setRoundModeStore(mode);
      // Work is a round-only metric — fall back when leaving round mode.
      if (mode === 'alltime') {
        setMetric((m) => (m === 'work' ? 'difficulty' : m));
      }
    },
    [setRoundModeStore]
  );

  // Resolve the active entry set from timeframe × metric.
  const entries: Entry[] = useMemo(() => {
    if (roundMode === 'round') {
      if (metric === 'work') return roundWorkEntries ?? [];
      return metric === 'difficulty'
        ? roundDifficultyEntries ?? []
        : roundLoyaltyEntries ?? [];
    }
    return metric === 'difficulty' ? difficultyEntries : loyaltyEntries;
  }, [roundMode, metric, difficultyEntries, loyaltyEntries, roundDifficultyEntries, roundLoyaltyEntries, roundWorkEntries]);

  const userIndex = useMemo(
    () =>
      userAddress ? entries.findIndex((e) => addressMatches(e.address, userAddress)) : -1,
    [entries, userAddress]
  );

  const handleJumpToYou = useCallback(() => {
    if (userIndex < 0) return;
    haptics.light();
    // Center the user's row within the bounded viewport (~3 rows of lead-in).
    const y = Math.max(0, userIndex * ROW_HEIGHT - LIST_MAX_HEIGHT / 2 + ROW_HEIGHT / 2);
    scrollRef.current?.scrollTo({ y, animated: true });
  }, [userIndex]);

  const metaText = totalMembers
    ? t('pool.leaderboardMeta', { shown: entries.length, total: formatNumber(totalMembers) })
    : t('pool.leaderboardMetaShort', { shown: entries.length });

  // Build the row elements once per data/metric/user change so frequent parent
  // re-renders (pool-stats polling) don't rebuild the whole list.
  const rows = useMemo(
    () =>
      entries.map((entry, index) => {
        const isUser = !!userAddress && addressMatches(entry.address, userAddress);
        return (
          <Row
            key={'id' in entry ? `${entry.id}-${index}` : `${entry.address}-${index}`}
            rank={`#${index + 1}`}
            label={isUser ? t('common.you') : truncateAddress(entry.address, 6)}
            value={formatValue(metric, entry)}
            isUser={isUser}
          />
        );
      }),
    [entries, metric, userAddress, t]
  );

  return (
    <View className={`border border-border ${className}`} style={{ backgroundColor: colors.card }}>
      {/* Title + timeframe text switch */}
      <View
        className="flex-row items-center justify-between"
        style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10 }}
      >
        <Text variant="subtitle" style={{ fontSize: 15, color: colors.textHigh }}>
          {t('pool.leaderboard')}
        </Text>
        <View className="flex-row items-center" style={{ gap: 12 }}>
          <TextSwitch
            label={t('pool.sinceBlock')}
            active={roundMode === 'round'}
            onPress={() => handleTimeframe('round')}
          />
          <TextSwitch
            label={t('pool.allTime')}
            active={roundMode === 'alltime'}
            onPress={() => handleTimeframe('alltime')}
          />
        </View>
      </View>

      {/* Metric segmented control */}
      <View
        className="flex-row border border-border"
        style={{ marginHorizontal: 14, marginBottom: 8 }}
      >
        <Segment
          label={t('pool.topDiff')}
          active={metric === 'difficulty'}
          onPress={() => handleMetric('difficulty')}
        />
        <Segment
          label={t('pool.blocksParticipated')}
          active={metric === 'loyalty'}
          onPress={() => handleMetric('loyalty')}
        />
        {roundMode === 'round' && (
          <Segment
            label={t('pool.work')}
            active={metric === 'work'}
            onPress={() => handleMetric('work')}
          />
        )}
      </View>

      {/* Meta + jump-to-you */}
      <View
        className="flex-row items-center justify-between"
        style={{ paddingHorizontal: 14, paddingBottom: 10 }}
      >
        <Text variant="mono" style={{ fontSize: 10, color: colors.textFaint }}>
          {metaText}
        </Text>
        {userIndex >= 0 && (
          <Pressable
            onPress={handleJumpToYou}
            hitSlop={6}
            className="flex-row items-center active:opacity-60"
            style={{
              gap: 5,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.14)',
              paddingHorizontal: 8,
              paddingVertical: 4,
            }}
          >
            <Ionicons name="arrow-down" size={11} color={colors.textSecondary} />
            <Text variant="mono" style={{ fontSize: 10, color: colors.textSecondary }}>
              {t('pool.jumpToYou')}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Rows (bounded internal scroll) / loading / empty */}
      {isLoading && entries.length === 0 ? (
        <View>
          {Array.from({ length: 5 }).map((_, i) => (
            <View
              key={i}
              className="flex-row items-center justify-between border-t border-border-light"
              style={{ height: ROW_HEIGHT, paddingHorizontal: 14 }}
            >
              <SkeletonLoader variant="text" width={120} height={13} />
              <SkeletonLoader variant="text" width={48} height={13} />
            </View>
          ))}
        </View>
      ) : entries.length === 0 ? (
        <View className="border-t border-border-light" style={{ paddingVertical: 20 }}>
          <Text variant="caption" color="muted" className="text-center">
            {t('pool.noEntries')}
          </Text>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={{ maxHeight: LIST_MAX_HEIGHT }}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
        >
          {rows}
        </ScrollView>
      )}

      {/* Pinned, always-visible "You" footer */}
      {userAddress && (
        <View
          className="flex-row items-center justify-between"
          style={{
            height: ROW_HEIGHT,
            paddingHorizontal: 14,
            borderTopWidth: 1,
            borderTopColor: 'rgba(255,255,255,0.22)',
            backgroundColor: 'rgba(255,255,255,0.04)',
          }}
        >
          <View className="flex-row items-center" style={{ flex: 1, gap: 12 }}>
            <Text variant="mono" style={{ fontSize: 12, color: colors.textSecondary, width: 36 }}>
              {userIndex >= 0 ? `#${userIndex + 1}` : '#—'}
            </Text>
            <Text variant="mono" className="font-bold text-foreground" style={{ fontSize: 13 }}>
              {t('common.you')}
            </Text>
          </View>
          <Text
            variant="mono"
            className="font-bold"
            style={{ fontSize: 13, color: userIndex >= 0 ? colors.text : colors.textDim }}
          >
            {userIndex >= 0 ? formatValue(metric, entries[userIndex]) : t('pool.notRanked')}
          </Text>
        </View>
      )}
    </View>
  );
}
