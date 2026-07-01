/**
 * BlocksList component - List of blocks found by the pool
 */

import { View, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { haptics } from '@/utils/haptics';
import { Card } from '../Card';
import { Text } from '../Text';
import { SkeletonLoader, SkeletonText } from '../SkeletonLoader';
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

export function BlocksList({
  blocks,
  isLoading = false,
  maxItems = 5,
  className = '',
}: BlocksListProps) {
  const { t } = useTranslation();

  // Show skeleton when loading with no data
  if (isLoading && (!blocks || blocks.length === 0)) {
    return (
      <Card className={className}>
        <Text variant="subtitle" className="mb-3">
          {t('pool.topShares')}
        </Text>
        {Array.from({ length: 3 }).map((_, i) => (
          <View key={i} className="flex-row items-center py-2.5 gap-3">
            <SkeletonLoader variant="circle" width={24} />
            <View className="flex-1">
              <SkeletonText lines={1} />
            </View>
          </View>
        ))}
      </Card>
    );
  }

  // Empty state
  if (!blocks || blocks.length === 0) {
    return (
      <Card className={className}>
        <Text variant="subtitle" className="mb-3">
          {t('pool.topShares')}
        </Text>
        <Text variant="caption" color="muted" className="text-center py-4">
          {t('pool.noShares')}
        </Text>
      </Card>
    );
  }

  const displayBlocks = blocks.slice(0, maxItems);

  return (
    <Card className={className}>
      <Text variant="subtitle">{t('pool.topShares')}</Text>
      <Text variant="caption" color="muted" className="mb-3">
        {t('pool.topSharesSubtitle')}
      </Text>
      {displayBlocks.map((block, index) => (
        <Pressable
          key={`${block.block_height}-${index}`}
          onPress={() => {
            haptics.light();
            Linking.openURL(`https://parasite.space/block/${block.block_height}`);
          }}
          className={`flex-row items-center py-2.5 ${
            index < displayBlocks.length - 1 ? 'border-b border-border/50' : ''
          }`}
        >
          <Ionicons name="cube-outline" size={20} color={colors.textMuted} />
          <Text variant="mono" className="ml-2 text-sm">
            #{block.block_height}
          </Text>

          {/* Top diff (value) + submitter address, right-aligned */}
          <View className="ml-auto items-end">
            <View className="flex-row items-center gap-1">
              {block.claimed && (
                <Ionicons name="checkmark-circle" size={13} color={colors.primary} />
              )}
              <Text variant="mono" className="text-sm">
                {block.difficulty != null
                  ? formatDifficulty(block.difficulty)
                  : '--'}
              </Text>
            </View>
            <View className="flex-row items-center">
              <Text variant="caption" color="muted" className="text-xs">
                {block.top_diff_address
                  ? truncateAddress(block.top_diff_address, 4)
                  : '—'}
              </Text>
              {block.block_timestamp ? (
                <Text variant="caption" color="muted" className="text-xs">
                  {' · '}
                  {formatTimestamp(block.block_timestamp * 1000)}
                </Text>
              ) : null}
            </View>
          </View>

          <Ionicons name="open-outline" size={14} color={colors.textMuted} style={{ marginLeft: 8 }} />
        </Pressable>
      ))}
    </Card>
  );
}
