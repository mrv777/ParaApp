/**
 * HomeMainScreen - Main home screen with user stats or pool preview
 */

import { useState, useCallback } from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorBanner } from '@/components/ErrorBanner';
import { AddAddressPrompt } from '@/components/home/AddAddressPrompt';
import { PoolSummaryCard } from '@/components/home/PoolSummaryCard';
import { UserStatsCard } from '@/components/home/UserStatsCard';
import { WorkersPreviewCard } from '@/components/home/WorkersPreviewCard';
import { usePoolPolling, useUserPolling } from '@/hooks';
import {
  usePoolStore,
  selectPoolStats,
  selectPoolError,
} from '@/store/poolStore';
import {
  useUserStore,
  selectUserStats,
  selectUserWorkers,
  selectIsUserLoading,
  selectUserError,
} from '@/store/userStore';
import { useSettingsStore, selectHasAddress } from '@/store/settingsStore';
import { colors } from '@/constants/colors';
import type { HomeStackScreenProps } from '@/types/navigation';

type Props = HomeStackScreenProps<'HomeMain'>;

export function HomeMainScreen({ navigation }: Props) {
  const [refreshing, setRefreshing] = useState(false);

  // Settings store
  const hasAddress = useSettingsStore(selectHasAddress);

  // Pool store (for preview when no address)
  const poolStats = usePoolStore(selectPoolStats);
  const poolError = usePoolStore(selectPoolError);
  const isPoolLoading = usePoolStore((s) => s.isLoading);
  const refreshPool = usePoolStore((s) => s.refreshAll);
  const clearPoolError = usePoolStore((s) => s.clearError);

  // User store (when address is configured)
  const userStats = useUserStore(selectUserStats);
  const workers = useUserStore(selectUserWorkers);
  const isUserLoading = useUserStore(selectIsUserLoading);
  const userError = useUserStore(selectUserError);
  const refreshUser = useUserStore((s) => s.refreshAll);
  const clearUserError = useUserStore((s) => s.clearError);

  // Initialize polling
  usePoolPolling();
  useUserPolling();

  // Determine which error to show
  const error = hasAddress ? userError : poolError;
  const clearError = hasAddress ? clearUserError : clearPoolError;

  // Determine connection status
  const isLoading = hasAddress ? isUserLoading : isPoolLoading;
  const connectionStatus = isLoading ? 'connecting' : error ? 'offline' : 'connected';

  // Pull-to-refresh handler
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    if (hasAddress) {
      await refreshUser();
    }
    await refreshPool();
    setRefreshing(false);
  }, [hasAddress, refreshUser, refreshPool]);

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
            className="mx-4 mt-4"
          />
        )}

        {hasAddress ? (
          /* With Address: Show user stats and workers */
          <View className="px-4 pt-4 gap-4">
            <UserStatsCard
              stats={userStats ?? null}
              isLoading={isUserLoading}
            />
            <WorkersPreviewCard
              workers={workers}
              onViewAll={handleViewAllWorkers}
              isLoading={isUserLoading}
              connectionStatus={connectionStatus}
            />
          </View>
        ) : (
          /* Without Address: Show pool preview and add address CTA */
          <View className="px-4 pt-4 gap-4">
            <PoolSummaryCard
              stats={poolStats ?? null}
              isLoading={isPoolLoading}
            />
            <AddAddressPrompt onPress={handleAddAddress} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
