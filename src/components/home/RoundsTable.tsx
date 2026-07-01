/**
 * RoundsTable - Per-round standings for the configured user, adapted for phone
 * widths. Each metric (diff / work / blocks) is one column that stacks the
 * user's rank over the magnitude; the participant total is shown once under the
 * block. Four columns fit without horizontal scrolling.
 */

import { useState } from 'react';
import { View, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../Card';
import { Text } from '../Text';
import { InfoSheet, type InfoItem } from '../InfoSheet';
import { SkeletonLoader } from '../SkeletonLoader';
import { formatDifficulty, formatNumber } from '@/utils/formatting';
import { haptics } from '@/utils/haptics';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';
import type { UserRoundsResponse } from '@/types';

export interface RoundsTableProps {
  rounds: UserRoundsResponse | null;
  isLoading?: boolean;
  className?: string;
}

const BLOCK_COL = 78; // px; metric columns take the remaining width via flex-1
// History rows shown before the "Show all" toggle (the current round is always shown).
const COLLAPSED_HISTORY = 6;

interface Row {
  key: string;
  label: string;
  blockHeight: number | null; // null = current round (not tappable)
  total: number;
  diffRank: number;
  topDiff: string;
  workRank: number;
  work: string;
  blocksRank: number;
  blocks: string;
}

/** Column header aligned to its cells. */
function HeaderCell({ label, width }: { label: string; width?: number }) {
  return (
    <Text
      variant="caption"
      color="muted"
      className={`text-[11px] uppercase px-1 ${width ? 'text-left' : 'flex-1 text-right'}`}
      style={width ? { width } : undefined}
      numberOfLines={1}
    >
      {label}
    </Text>
  );
}

/** One metric column: rank (#N) over its magnitude. */
function MetricCell({ rank, value }: { rank: number; value: string }) {
  return (
    <View className="flex-1 px-1 items-end">
      <Text variant="mono" className="text-sm" numberOfLines={1}>
        #{formatNumber(rank)}
      </Text>
      <Text
        variant="caption"
        color="muted"
        className="text-[11px]"
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

export function RoundsTable({
  rounds,
  isLoading = false,
  className = '',
}: RoundsTableProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);

  const infoItems: InfoItem[] = [
    { label: t('home.colBlock'), description: t('home.roundsInfoBlockDesc') },
    { label: t('home.colDiff'), description: t('home.roundsInfoDiffDesc') },
    { label: t('home.colWork'), description: t('home.roundsInfoWorkDesc') },
    { label: t('home.colBlocks'), description: t('home.roundsInfoBlocksDesc') },
  ];

  const Header = (
    <View className="flex-row items-center gap-2 mb-3">
      <Ionicons name="albums-outline" size={18} color={colors.textMuted} />
      <Text variant="subtitle" className="text-base">
        {t('home.rounds')}
      </Text>
      <Pressable
        onPress={() => {
          haptics.selection();
          setInfoVisible(true);
        }}
        hitSlop={8}
        className="active:opacity-60"
      >
        <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );

  if (isLoading && !rounds) {
    return (
      <Card padding="sm" className={className}>
        {Header}
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} className="py-2.5">
            <SkeletonLoader variant="text" width="100%" height={18} />
          </View>
        ))}
      </Card>
    );
  }

  const hasCurrent = !!rounds?.current_round;
  const hasHistory = !!rounds && rounds.history.length > 0;
  if (!hasCurrent && !hasHistory) {
    return null;
  }

  const rows: Row[] = [];

  if (rounds?.current_round) {
    const c = rounds.current_round;
    rows.push({
      key: 'current',
      label: t('home.roundsCurrent'),
      blockHeight: null,
      total: c.total_participants,
      diffRank: c.rank,
      topDiff: formatDifficulty(c.top_diff),
      workRank: c.work_rank,
      work: formatDifficulty(c.total_work),
      blocksRank: c.blocks_rank,
      blocks: formatNumber(c.blocks_participated),
    });
  }

  rounds?.history.forEach((h) => {
    rows.push({
      key: `${h.block_height}`,
      label: formatNumber(h.block_height),
      blockHeight: h.block_height,
      total: h.total_participants,
      diffRank: h.rank,
      topDiff: formatDifficulty(h.top_diff),
      workRank: h.work_rank,
      work: formatDifficulty(h.total_work),
      blocksRank: h.blocks_rank,
      blocks: formatNumber(h.blocks_participated),
    });
  });

  // Collapse long histories: always show the current round + a few recent rows.
  const hasCurrentRow = rows.length > 0 && rows[0].blockHeight === null;
  const collapsedCount = (hasCurrentRow ? 1 : 0) + COLLAPSED_HISTORY;
  const canCollapse = rows.length > collapsedCount;
  const visibleRows = expanded || !canCollapse ? rows : rows.slice(0, collapsedCount);
  const hiddenCount = rows.length - visibleRows.length;

  const openBlock = (height: number) => {
    haptics.light();
    Linking.openURL(`https://parasite.space/block/${height}`);
  };

  return (
    <Card padding="sm" className={className}>
      {Header}

      {/* Column headers */}
      <View className="flex-row items-center pb-2 border-b border-border">
        <HeaderCell label={t('home.colBlock')} width={BLOCK_COL} />
        <HeaderCell label={t('home.colDiff')} />
        <HeaderCell label={t('home.colWork')} />
        <HeaderCell label={t('home.colBlocks')} />
      </View>

      {/* Data rows */}
      {visibleRows.map((row, index) => {
        const isCurrent = row.blockHeight === null;
        const content = (
          <View
            className={`flex-row items-center py-2.5 ${
              index < visibleRows.length - 1 ? 'border-b border-border/50' : ''
            }`}
          >
            {/* Block + participant total (shown once for the round) */}
            <View style={{ width: BLOCK_COL }} className="px-1">
              <Text
                variant="mono"
                color={isCurrent ? 'default' : 'muted'}
                className={`text-xs ${isCurrent ? 'font-semibold' : ''}`}
                numberOfLines={1}
              >
                {row.label}
              </Text>
              <Text
                variant="caption"
                color="muted"
                className="text-[11px]"
                numberOfLines={1}
              >
                {t('home.roundsOf', { total: formatNumber(row.total) })}
              </Text>
            </View>

            <MetricCell rank={row.diffRank} value={row.topDiff} />
            <MetricCell rank={row.workRank} value={row.work} />
            <MetricCell rank={row.blocksRank} value={row.blocks} />
          </View>
        );

        if (row.blockHeight === null) {
          return <View key={row.key}>{content}</View>;
        }
        const height = row.blockHeight;
        return (
          <Pressable
            key={row.key}
            onPress={() => openBlock(height)}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            {content}
          </Pressable>
        );
      })}

      {/* Show all / show less toggle for long histories */}
      {canCollapse && (
        <Pressable
          onPress={() => {
            haptics.selection();
            setExpanded((e) => !e);
          }}
          className="pt-3 flex-row items-center justify-center gap-1 active:opacity-60"
        >
          <Text variant="caption" color="muted">
            {expanded
              ? t('home.roundsShowLess')
              : t('home.roundsShowMore', { n: hiddenCount })}
          </Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.textMuted}
          />
        </Pressable>
      )}

      <InfoSheet
        visible={infoVisible}
        onClose={() => setInfoVisible(false)}
        title={t('home.rounds')}
        intro={t('home.roundsInfoIntro')}
        items={infoItems}
      />
    </Card>
  );
}
