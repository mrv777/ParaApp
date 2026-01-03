/**
 * LeaderboardCard component - Tabbed leaderboard with user highlighting
 */

import { useState, useCallback } from 'react';
import { ScrollView, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '@/i18n';
import { Card } from '../Card';
import { Text } from '../Text';
import { SkeletonLoader, SkeletonText } from '../SkeletonLoader';
import { truncateAddress, formatDifficulty, formatNumber } from '@/utils/formatting';
import { addressMatches } from '@/utils/address';
import { haptics } from '@/utils/haptics';
import { colors } from '@/constants/colors';
import type { DifficultyLeaderboardEntry, LoyaltyLeaderboardEntry } from '@/types';

type LeaderboardTab = 'difficulty' | 'loyalty';

export interface LeaderboardCardProps {
  difficultyEntries: DifficultyLeaderboardEntry[];
  loyaltyEntries: LoyaltyLeaderboardEntry[];
  userAddress?: string;
  isLoading?: boolean;
  maxHeight?: number;
  className?: string;
}

interface TabButtonProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
}

function TabButton({ label, isActive, onPress }: TabButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 py-2 rounded-lg ${isActive ? 'bg-foreground/10' : ''}`}
    >
      <Text
        variant="caption"
        color={isActive ? 'default' : 'muted'}
        className="text-center font-medium"
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function LeaderboardCard({
  difficultyEntries,
  loyaltyEntries,
  userAddress,
  isLoading = false,
  maxHeight = 400,
  className = '',
}: LeaderboardCardProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('difficulty');

  const handleTabChange = useCallback((tab: LeaderboardTab) => {
    haptics.selection();
    setActiveTab(tab);
  }, []);

  const entries = activeTab === 'difficulty' ? difficultyEntries : loyaltyEntries;

  // Find user's position in current leaderboard using flexible matching
  const userIndex = userAddress
    ? entries.findIndex((e) => addressMatches(e.address, userAddress))
    : -1;

  // Show skeleton when loading with no data
  if (isLoading && (!entries || entries.length === 0)) {
    return (
      <Card className={className}>
        {/* Tab buttons */}
        <View className="flex-row gap-2 mb-3">
          <TabButton
            label={t('pool.topDifficulty')}
            isActive={activeTab === 'difficulty'}
            onPress={() => handleTabChange('difficulty')}
          />
          <TabButton
            label={t('pool.topLoyalty')}
            isActive={activeTab === 'loyalty'}
            onPress={() => handleTabChange('loyalty')}
          />
        </View>
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

  // Format value based on active tab
  const formatValue = (entry: DifficultyLeaderboardEntry | LoyaltyLeaderboardEntry) => {
    if (activeTab === 'difficulty') {
      return formatDifficulty((entry as DifficultyLeaderboardEntry).diff);
    }
    return `${formatNumber((entry as LoyaltyLeaderboardEntry).total_blocks)} blocks`;
  };

  // Get user's formatted value
  const getUserValue = () => {
    if (userIndex === -1) return '';
    return formatValue(entries[userIndex]);
  };

  return (
    <Card className={className}>
      {/* Tab buttons */}
      <View className="flex-row gap-2 mb-3">
        <TabButton
          label={t('pool.topDifficulty')}
          isActive={activeTab === 'difficulty'}
          onPress={() => handleTabChange('difficulty')}
        />
        <TabButton
          label={t('pool.topLoyalty')}
          isActive={activeTab === 'loyalty'}
          onPress={() => handleTabChange('loyalty')}
        />
      </View>

      {/* Empty state */}
      {(!entries || entries.length === 0) && (
        <Text variant="caption" color="muted" className="text-center py-4">
          {t('pool.noEntries')}
        </Text>
      )}

      {/* Leaderboard list */}
      {entries && entries.length > 0 && (
        <ScrollView style={{ maxHeight }} nestedScrollEnabled>
          {entries.map((entry, index) => {
            const isUser = userAddress && addressMatches(entry.address, userAddress);

            return (
              <View
                key={`${entry.id}-${index}`}
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
                  {isUser ? t('common.you') : truncateAddress(entry.address, 6)}
                </Text>
                <Text variant="mono" className="text-sm">
                  {formatValue(entry)}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* User position pinned section */}
      {userIndex !== -1 && userAddress && (
        <View className="mt-2 pt-2 border-t border-border">
          <View className="flex-row items-center py-2 bg-foreground/5 -mx-2 px-2 rounded">
            <Text variant="mono" color="muted" className="w-8 text-sm">
              #{userIndex + 1}
            </Text>
            <Text variant="caption" className="flex-1">
              {t('common.you')}
            </Text>
            <Text variant="mono" className="text-sm">
              {getUserValue()}
            </Text>
          </View>
        </View>
      )}

      {/* Empty state hint when no address configured */}
      {!userAddress && entries && entries.length > 0 && (
        <View className="mt-2 pt-2 border-t border-border flex-row items-center gap-2">
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
          <Text variant="caption" color="muted">
            {t('pool.addAddressHint')}
          </Text>
        </View>
      )}
    </Card>
  );
}
