/**
 * RoundsTable - Per-round standings for the configured user. A 4-column table
 * (BLOCK / DIFF / WORK / BLOCKS) where each metric stacks the user's rank over
 * the round magnitude. Terminal/brutalist styling; scrolls within page flow and
 * collapses long histories behind a "show more" toggle.
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

/** Column header aligned to its cells. `block` = left-aligned wider first column. */
function HeaderCell({ label, block = false }: { label: string; block?: boolean }) {
  return (
    <View style={{ flex: block ? 1.3 : 1 }}>
      <Text
        variant="caption"
        className="uppercase"
        style={{
          fontSize: 10,
          letterSpacing: 1,
          color: colors.textFaint,
          textAlign: block ? 'left' : 'right',
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

/** One metric column: rank (#N) over its magnitude, right-aligned. */
function MetricCell({ rank, value }: { rank: number; value: string }) {
  return (
    <View style={{ flex: 1 }} className="items-end">
      <Text variant="mono" style={{ fontSize: 13, color: colors.textValue }} numberOfLines={1}>
        #{formatNumber(rank)}
      </Text>
      <Text variant="mono" style={{ fontSize: 11, color: colors.textFaint }} numberOfLines={1}>
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
    <View
      className="flex-row items-center"
      style={{ gap: 7, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}
    >
      <Text variant="subtitle" style={{ fontSize: 15, color: colors.textHigh }}>
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
        <Ionicons name="information-circle-outline" size={14} color={colors.textDim} />
      </Pressable>
    </View>
  );

  if (isLoading && !rounds) {
    return (
      <Card padding="none" className={className}>
        {Header}
        <View style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonLoader key={i} variant="text" width="100%" height={18} />
          ))}
        </View>
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
    <Card padding="none" className={className}>
      {Header}

      {/* Column headers */}
      <View
        className="flex-row items-center"
        style={{ paddingHorizontal: 16, paddingBottom: 8 }}
      >
        <HeaderCell label={t('home.colBlock')} block />
        <HeaderCell label={t('home.colDiff')} />
        <HeaderCell label={t('home.colWork')} />
        <HeaderCell label={t('home.colBlocks')} />
      </View>

      {/* Data rows */}
      {visibleRows.map((row) => {
        const isCurrent = row.blockHeight === null;
        const content = (
          <View
            className="flex-row items-center border-t border-border-light"
            style={{ paddingHorizontal: 16, paddingVertical: 11 }}
          >
            {/* Block + participant total (shown once for the round) */}
            <View style={{ flex: 1.3 }}>
              <Text
                variant="mono"
                className="font-bold"
                style={{ fontSize: 13, color: isCurrent ? colors.text : colors.textMuted }}
                numberOfLines={1}
              >
                {row.label}
              </Text>
              <Text
                variant="mono"
                style={{ fontSize: 11, color: colors.textFaint }}
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
          className="flex-row items-center justify-center border-t border-border-light active:opacity-60"
          style={{ paddingVertical: 12, gap: 4 }}
        >
          <Text variant="mono" style={{ fontSize: 12, color: colors.textMuted }}>
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
