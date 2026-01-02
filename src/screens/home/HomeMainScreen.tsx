/**
 * HomeMainScreen - Main home screen with user stats or pool preview
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorBanner } from '@/components/ErrorBanner';
import { AddAddressPrompt } from '@/components/home/AddAddressPrompt';
import { PoolStatsBar } from '@/components/home/PoolStatsBar';
import { UserStatsCard } from '@/components/home/UserStatsCard';
import { WorkersPreviewCard } from '@/components/home/WorkersPreviewCard';
import { usePoolPolling, useUserPolling, useUserRanks } from '@/hooks';
import {
  usePoolStore,
  selectPoolError,
} from '@/store/poolStore';
import {
  useUserStore,
  selectUserStats,
  selectUserWorkers,
  selectIsUserLoading,
  selectUserError,
} from '@/store/userStore';
import { useSettingsStore, selectHasAddress, selectWorkerSortOrder } from '@/store/settingsStore';
import { sortWorkers } from '@/utils/sorting';
import { colors } from '@/constants/colors';
import type { HomeStackScreenProps } from '@/types/navigation';

type Props = HomeStackScreenProps<'HomeMain'>;

export function HomeMainScreen({ navigation }: Props) {
  const [refreshing, setRefreshing] = useState(false);

  // Settings store
  const hasAddress = useSettingsStore(selectHasAddress);
  const workerSortOrder = useSettingsStore(selectWorkerSortOrder);

  // Pool store
  const poolError = usePoolStore(selectPoolError);
  const isPoolLoading = usePoolStore((s) => s.isLoading);
  const refreshPool = usePoolStore((s) => s.refreshAll);
  const clearPoolError = usePoolStore((s) => s.clearError);
  const fetchLeaderboards = usePoolStore((s) => s.fetchLeaderboards);

  // User store (when address is configured)
  const userStats = useUserStore(selectUserStats);
  const workers = useUserStore(selectUserWorkers);
  const isUserLoading = useUserStore(selectIsUserLoading);
  const userError = useUserStore(selectUserError);
  const refreshUser = useUserStore((s) => s.refreshAll);
  const clearUserError = useUserStore((s) => s.clearError);

  // Sort workers based on user preference (memoized for referential equality)
  const sortedWorkers = useMemo(
    () => sortWorkers(workers, workerSortOrder),
    [workers, workerSortOrder]
  );

  // Initialize polling
  usePoolPolling();
  useUserPolling();

  // Fetch leaderboards on mount (for user rank display)
  useEffect(() => {
    fetchLeaderboards();
  }, [fetchLeaderboards]);

  // Get user leaderboard ranks
  const { difficultyRank, loyaltyRank } = useUserRanks();

  // Determine which error to show
  const error = hasAddress ? userError : poolError;
  const clearError = hasAddress ? clearUserError : clearPoolError;

  // Determine connection status
  const isLoading = hasAddress ? isUserLoading : isPoolLoading;
  const connectionStatus = isLoading ? 'connecting' : error ? 'offline' : 'connected';

  // Pull-to-refresh handler
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      hasAddress ? refreshUser() : Promise.resolve(),
      refreshPool(),
      fetchLeaderboards(),
    ]);
    setRefreshing(false);
  }, [hasAddress, refreshUser, refreshPool, fetchLeaderboards]);

  // Navigate to Settings to add address
  const handleAddAddress = useCallback(() => {
    navigation.getParent()?.navigate('Settings');
  }, [navigation]);

  // Navigate to Workers List
  const handleViewAllWorkers = useCallback(() => {
    navigation.navigate('WorkersList');
  }, [navigation]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* Pool Stats Bar - Always visible at top */}
      <PoolStatsBar />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.text}
            colors={[colors.text]}
          />
        }
      >
        {/* Error Banner */}
        {error && (
          <ErrorBanner
            message={error.message}
            onRetry={handleRefresh}
            onDismiss={clearError}
            className="mx-4 mt-2"
          />
        )}

        {hasAddress ? (
          /* With Address: Show user stats and workers */
          <View className="px-4 pt-3 gap-3">
            <UserStatsCard
              stats={userStats ?? null}
              difficultyRank={difficultyRank}
              loyaltyRank={loyaltyRank}
              isLoading={isUserLoading}
            />
            <WorkersPreviewCard
              workers={sortedWorkers}
              onViewAll={handleViewAllWorkers}
              isLoading={isUserLoading}
              connectionStatus={connectionStatus}
            />
          </View>
        ) : (
          /* Without Address: Show add address CTA */
          <View className="px-4 pt-3 gap-3">
            <AddAddressPrompt onPress={handleAddAddress} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
