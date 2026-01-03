/**
 * BlocksList component - List of blocks found by the pool
 */

import { View, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { haptics } from '@/utils/haptics';
import { Card } from '../Card';
import { Text } from '../Text';
import { SkeletonLoader, SkeletonText } from '../SkeletonLoader';
import { formatTimestamp, truncateAddress } from '@/utils/formatting';
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
          {t('pool.blocksFound')}
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
          {t('pool.blocksFound')}
        </Text>
        <Text variant="caption" color="muted" className="text-center py-4">
          {t('pool.noBlocks')}
        </Text>
      </Card>
    );
  }

  const displayBlocks = blocks.slice(0, maxItems);

  return (
    <Card className={className}>
      <Text variant="subtitle" className="mb-3">
        {t('pool.blocksFound')}
      </Text>
      {displayBlocks.map((block, index) => (
        <Pressable
          key={`${block.block_height}-${index}`}
          onPress={() => {
            haptics.light();
            Linking.openURL(`https://mempool.space/block/${block.block_height}`);
          }}
          className={`flex-row items-center py-2.5 ${
            index < displayBlocks.length - 1 ? 'border-b border-border/50' : ''
          }`}
        >
          <Ionicons name="cube-outline" size={20} color={colors.textMuted} />
          <Text variant="mono" className="ml-2 text-sm">
            #{block.block_height}
          </Text>
          <Text variant="caption" color="muted" className="ml-auto">
            {truncateAddress(block.top_diff_address, 4)}
          </Text>
          <Text variant="caption" color="muted" className="ml-3 min-w-[70px] text-right">
            {block.block_timestamp
              ? formatTimestamp(block.block_timestamp * 1000)
              : '--'}
          </Text>
          <Ionicons name="open-outline" size={14} color={colors.textMuted} style={{ marginLeft: 8 }} />
        </Pressable>
      ))}
    </Card>
  );
}
