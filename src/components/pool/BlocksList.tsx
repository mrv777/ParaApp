/**
 * BlocksList - "Best Shares": the highest-difficulty share submitted by a pool
 * member per block. Terminal/brutalist square card. Each row leads with the
 * block number over a dim `address · age` meta line, with the difficulty value
 * right-aligned. Rows deep-link to the block on parasite.space.
 */

import { View, Pressable, Linking } from 'react-native';
import { haptics } from '@/utils/haptics';
import { Text } from '../Text';
import { SkeletonLoader } from '../SkeletonLoader';
import { formatTimestamp, truncateAddress, formatDifficulty } from '@/utils/formatting';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';
import type { LeaderboardEntry } from '@/types';

export interface BlocksListProps {
  blocks: LeaderboardEntry[];
  isLoading?: boolean;
  maxItems?: number;
  className?: string;
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4 }}>
      <Text variant="subtitle" style={{ fontSize: 15, color: colors.textHigh }}>
        {title}
      </Text>
      <Text variant="mono" style={{ fontSize: 11, color: colors.textDim, marginTop: 3 }}>
        {subtitle}
      </Text>
    </View>
  );
}

export function BlocksList({
  blocks,
  isLoading = false,
  maxItems = 5,
  className = '',
}: BlocksListProps) {
  const { t } = useTranslation();
  const title = t('pool.topShares');
  const subtitle = t('pool.bestSharesSubtitle');

  if (isLoading && (!blocks || blocks.length === 0)) {
    return (
      <View className={`border border-border ${className}`} style={{ backgroundColor: colors.card }}>
        <Header title={title} subtitle={subtitle} />
        {Array.from({ length: 3 }).map((_, i) => (
          <View
            key={i}
            className="flex-row items-center justify-between border-t border-border-light"
            style={{ paddingHorizontal: 14, paddingVertical: 11 }}
          >
            <View style={{ gap: 4 }}>
              <SkeletonLoader variant="text" width={70} height={13} />
              <SkeletonLoader variant="text" width={130} height={11} />
            </View>
            <SkeletonLoader variant="text" width={48} height={14} />
          </View>
        ))}
      </View>
    );
  }

  if (!blocks || blocks.length === 0) {
    return (
      <View className={`border border-border ${className}`} style={{ backgroundColor: colors.card }}>
        <Header title={title} subtitle={subtitle} />
        <View className="border-t border-border-light" style={{ paddingVertical: 20 }}>
          <Text variant="caption" color="muted" className="text-center">
            {t('pool.noShares')}
          </Text>
        </View>
      </View>
    );
  }

  const displayBlocks = blocks.slice(0, maxItems);

  return (
    <View className={`border border-border ${className}`} style={{ backgroundColor: colors.card }}>
      <Header title={title} subtitle={subtitle} />
      {displayBlocks.map((block, index) => {
        const addr = block.top_diff_address
          ? truncateAddress(block.top_diff_address, 4)
          : '—';
        const ago = block.block_timestamp
          ? formatTimestamp(block.block_timestamp * 1000)
          : null;
        return (
          <Pressable
            key={`${block.block_height}-${index}`}
            onPress={() => {
              haptics.light();
              Linking.openURL(`https://parasite.space/block/${block.block_height}`);
            }}
            className="flex-row items-center justify-between border-t border-border-light active:opacity-60"
            style={{ paddingHorizontal: 14, paddingVertical: 11 }}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text
                variant="mono"
                className="font-bold"
                style={{ fontSize: 13, color: colors.textValue }}
                numberOfLines={1}
              >
                #{block.block_height}
              </Text>
              <Text
                variant="mono"
                style={{ fontSize: 11, color: colors.textFaint, marginTop: 2 }}
                numberOfLines={1}
              >
                {addr}
                {ago ? ` · ${ago}` : ''}
              </Text>
            </View>
            <Text
              variant="mono"
              className="font-bold text-foreground"
              style={{ fontSize: 14 }}
            >
              {block.difficulty != null ? formatDifficulty(block.difficulty) : '--'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
