/**
 * HomeMainScreen - Main home screen with user stats or pool preview
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { View, ScrollView, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { ShareableStatsCard } from '@/components/home/ShareableStatsCard';
import { useShareStats } from '@/hooks/useShareStats';

import { ErrorBanner } from '@/components/ErrorBanner';
import { Text } from '@/components/Text';
import { TipBanner } from '@/components/TipBanner';
import { AddAddressPrompt } from '@/components/home/AddAddressPrompt';
import { FleetOverviewCard } from '@/components/home/FleetOverviewCard';
import { PoolStatsBar } from '@/components/home/PoolStatsBar';
import { UserStatsCard } from '@/components/home/UserStatsCard';
import { WorkersPreviewCard } from '@/components/home/WorkersPreviewCard';
import {
  UserHashrateChart,
  UserFullScreenChart,
  TimePresetButtons,
} from '@/components/charts';
import { usePoolPolling, useUserPolling, useUserRanks } from '@/hooks';
import {
  usePoolStore,
  selectPoolError,
} from '@/store/poolStore';
import {
  useUserStore,
  selectUserStats,
  selectUserWorkers,
  selectUserHistorical,
  selectIsUserLoading,
  selectUserError,
} from '@/store/userStore';
import { haptics } from '@/utils/haptics';
import { useSettingsStore, selectHasAddress, selectWorkerSortOrder, selectWorkerNotes } from '@/store/settingsStore';
import { useShallow } from 'zustand/react/shallow';
import { useMinerStore, selectFleetStats } from '@/store/minerStore';
import { sortWorkers } from '@/utils/sorting';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';
import type { HomeStackScreenProps } from '@/types/navigation';
import type { HistoricalPeriod } from '@/types';

type Props = HomeStackScreenProps<'HomeMain'>;

export function HomeMainScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const [fullScreenVisible, setFullScreenVisible] = useState(false);

  // Share stats functionality
  const shareCardRef = useRef<View>(null);
  const { isSharing, captureAndShare, shareError, clearError: clearShareError, shouldRenderCard } = useShareStats(shareCardRef);

  // Settings store
  const hasAddress = useSettingsStore(selectHasAddress);
  const workerSortOrder = useSettingsStore(selectWorkerSortOrder);
  const workerNotes = useSettingsStore(selectWorkerNotes);

  // Miner store - fleet stats for overview card (useShallow prevents infinite loop)
  const fleetStats = useMinerStore(useShallow(selectFleetStats));
  const refreshAllMiners = useMinerStore((s) => s.refreshAllMiners);

  // Pool store
  const poolError = usePoolStore(selectPoolError);
  const isPoolLoading = usePoolStore((s) => s.isLoading);
  const refreshPool = usePoolStore((s) => s.refreshAll);
  const clearPoolError = usePoolStore((s) => s.clearError);
  const fetchLeaderboards = usePoolStore((s) => s.fetchLeaderboards);

  // User store (when address is configured)
  const userStats = useUserStore(selectUserStats);
  const workers = useUserStore(selectUserWorkers);
  const historical = useUserStore(selectUserHistorical);
  const historicalPeriod = useUserStore((s) => s.historicalPeriod);
  const isUserLoading = useUserStore(selectIsUserLoading);
  const isLoadingHistorical = useUserStore((s) => s.isLoadingHistorical);
  const userError = useUserStore(selectUserError);
  const refreshUser = useUserStore((s) => s.refreshAll);
  const clearUserError = useUserStore((s) => s.clearError);
  const setHistoricalPeriod = useUserStore((s) => s.setHistoricalPeriod);
  const fetchHistorical = useUserStore((s) => s.fetchHistorical);

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

  // Refresh miners on mount if any are saved (they start offline after rehydration)
  useEffect(() => {
    if (fleetStats && fleetStats.onlineCount === 0) {
      refreshAllMiners();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch historical data when address is available
  useEffect(() => {
    if (hasAddress && !historical) {
      fetchHistorical(historicalPeriod);
    }
  }, [hasAddress, historical, fetchHistorical, historicalPeriod]);

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

  // Navigate to Miners tab
  const handleFleetPress = useCallback(() => {
    navigation.getParent()?.navigate('Miners');
  }, [navigation]);

  // Chart period change handler
  const handlePeriodChange = useCallback(
    (newPeriod: HistoricalPeriod) => {
      haptics.selection();
      setHistoricalPeriod(newPeriod);
    },
    [setHistoricalPeriod]
  );

  // Full screen chart handlers
  const openFullScreen = useCallback(() => {
    haptics.light();
    setFullScreenVisible(true);
  }, []);

  const closeFullScreen = useCallback(() => {
    setFullScreenVisible(false);
  }, []);

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
          /* With Address: Show user stats, chart, and workers */
          <View className="px-4 pt-3 gap-3">
            <UserStatsCard
              stats={userStats ?? null}
              difficultyRank={difficultyRank}
              loyaltyRank={loyaltyRank}
              isLoading={isUserLoading}
              onShare={captureAndShare}
              isSharing={isSharing}
            />

            {/* User Hashrate Chart */}
            <View>
              <TimePresetButtons
                selected={historicalPeriod}
                onSelect={handlePeriodChange}
                disabled={isLoadingHistorical}
                className="mb-3"
              />

              <Pressable onPress={openFullScreen} className="relative">
                <UserHashrateChart
                  data={historical ?? []}
                  period={historicalPeriod}
                  isLoading={isLoadingHistorical}
                  height={200}
                />
                {/* Expand hint overlay */}
                <View className="absolute bottom-2 right-2 flex-row items-center bg-background/80 rounded-full px-2 py-1">
                  <Ionicons name="expand-outline" size={14} color={colors.textMuted} />
                  <Text variant="caption" color="muted" className="ml-1 text-xs">
                    {t('home.tapToExpand')}
                  </Text>
                </View>
              </Pressable>
            </View>

            <WorkersPreviewCard
              workers={sortedWorkers}
              workerNotes={workerNotes}
              onViewAll={handleViewAllWorkers}
              isLoading={isUserLoading}
            />

            {/* Fleet Overview Card */}
            {fleetStats && (
              <FleetOverviewCard {...fleetStats} onPress={handleFleetPress} />
            )}

            {/* Tip for users without miners */}
            {!fleetStats && (
              <TipBanner tipId="home-miners-tip" icon="wifi-outline">
                {t('home.tipAddDevices')}
              </TipBanner>
            )}
          </View>
        ) : (
          /* Without Address: Show add address CTA */
          <View className="px-4 pt-3 gap-3">
            <AddAddressPrompt onPress={handleAddAddress} />

            {/* Fleet Overview Card (shown even without address) */}
            {fleetStats && (
              <FleetOverviewCard {...fleetStats} onPress={handleFleetPress} />
            )}
          </View>
        )}
      </ScrollView>

      {/* Full Screen Chart Modal */}
      <UserFullScreenChart
        visible={fullScreenVisible}
        onClose={closeFullScreen}
        data={historical ?? []}
        currentHashrate={userStats?.hashrate}
        period={historicalPeriod}
        onPeriodChange={handlePeriodChange}
        isLoading={isLoadingHistorical}
      />

      {/* Share Error Banner */}
      {shareError && (
        <ErrorBanner
          message={shareError}
          onDismiss={clearShareError}
          className="absolute bottom-24 left-4 right-4"
        />
      )}

      {/* Hidden shareable card for capture (off-screen, only mounted when sharing) */}
      {shouldRenderCard && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: -9999,
          }}
          pointerEvents="none"
        >
          <ShareableStatsCard
            ref={shareCardRef}
            hashrate={userStats?.hashrate ?? null}
            bestDifficulty={userStats?.bestDifficultyFormatted ?? null}
          />
        </View>
      )}
    </SafeAreaView>
  );
}
