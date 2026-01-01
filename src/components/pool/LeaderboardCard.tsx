/**
 * LeaderboardCard component - Scrollable leaderboard with user highlighting
 */

import { ScrollView, View } from 'react-native';
import { Card } from '../Card';
import { Text } from '../Text';
import { SkeletonLoader, SkeletonText } from '../SkeletonLoader';
import { truncateAddress, formatDifficulty } from '@/utils/formatting';
import type { LeaderboardEntry } from '@/types';

export interface LeaderboardCardProps {
  entries: LeaderboardEntry[];
  userAddress?: string;
  isLoading?: boolean;
  title?: string;
  maxHeight?: number;
  className?: string;
}

export function LeaderboardCard({
  entries,
  userAddress,
  isLoading = false,
  title = 'Top Difficulty',
  maxHeight = 300,
  className = '',
}: LeaderboardCardProps) {
  // Find user's position in leaderboard
  const userIndex = userAddress
    ? entries.findIndex((e) => e.top_diff_address === userAddress)
    : -1;

  // Show skeleton when loading with no data
  if (isLoading && (!entries || entries.length === 0)) {
    return (
      <Card className={className}>
        <Text variant="subtitle" className="mb-3">
          {title}
        </Text>
        {Array.from({ length: 5 }).map((_, i) => (
          <View key={i} className="flex-row items-center py-2 gap-2">
            <SkeletonLoader variant="text" width={24} height={16} />
            <View className="flex-1">
              <SkeletonText lines={1} />
            </View>
            <SkeletonLoader variant="text" width={60} height={16} />
          </View>
        ))}
      </Card>
    );
  }

  // Empty state
  if (!entries || entries.length === 0) {
    return (
      <Card className={className}>
        <Text variant="subtitle" className="mb-3">
          {title}
        </Text>
        <Text variant="caption" color="muted" className="text-center py-4">
          No entries yet
        </Text>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <Text variant="subtitle" className="mb-3">
        {title}
      </Text>
      <ScrollView style={{ maxHeight }} nestedScrollEnabled>
        {entries.map((entry, index) => {
          const isUser = userAddress && entry.top_diff_address === userAddress;

          return (
            <View
              key={`${entry.block_height}-${index}`}
              className={`flex-row items-center py-2 ${
                index < entries.length - 1 ? 'border-b border-border/50' : ''
              } ${isUser ? 'bg-foreground/5 -mx-2 px-2 rounded' : ''}`}
            >
              <Text
                variant="mono"
                color="muted"
                className="w-8 text-sm"
              >
                #{index + 1}
              </Text>
              <Text variant="caption" className="flex-1">
                {isUser ? 'You' : truncateAddress(entry.top_diff_address, 6)}
              </Text>
              <Text variant="mono" className="text-sm">
                {formatDifficulty(entry.difficulty)}
              </Text>
            </View>
          );
        })}
      </ScrollView>

      {/* Show user's position if they're not visible in the scrollable area */}
      {userIndex > 10 && userAddress && (
        <View className="mt-2 pt-2 border-t border-border">
          <View className="flex-row items-center py-2 bg-foreground/5 -mx-2 px-2 rounded">
            <Text variant="mono" color="muted" className="w-8 text-sm">
              #{userIndex + 1}
            </Text>
            <Text variant="caption" className="flex-1">
              You
            </Text>
            <Text variant="mono" className="text-sm">
              {formatDifficulty(entries[userIndex].difficulty)}
            </Text>
          </View>
        </View>
      )}
    </Card>
  );
}
