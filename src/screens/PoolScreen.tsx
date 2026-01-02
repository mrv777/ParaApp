/**
 * PoolScreen - Pool monitoring with stats, charts, and leaderboards
 */

import { useState, useCallback, useEffect } from 'react';
import { View, ScrollView, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import {
  StatItem,
  ErrorBanner,
  HashrateChart,
  TimePresetButtons,
  FullScreenChart,
  PoolStatsGrid,
  LeaderboardCard,
  SkeletonStatItem,
  Text,
} from '@/components';
import { usePoolPolling } from '@/hooks';
import {
  usePoolStore,
  selectPoolStats,
  selectDifficultyLeaderboard,
  selectLoyaltyLeaderboard,
  selectHistorical,
  selectBitcoinPrice,
  selectPoolError,
  isCacheStale,
} from '@/store/poolStore';
import { useSettingsStore } from '@/store/settingsStore';
import { formatHashrate } from '@/utils/formatting';
import { haptics } from '@/utils/haptics';
import { colors } from '@/constants/colors';
import type { MainTabScreenProps } from '@/types/navigation';
import type { HistoricalPeriod } from '@/types';

type Props = MainTabScreenProps<'Pool'>;

export function PoolScreen(_props: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const [fullScreenVisible, setFullScreenVisible] = useState(false);

  // Store selectors
  const stats = usePoolStore(selectPoolStats);
  const difficultyLeaderboard = usePoolStore(selectDifficultyLeaderboard);
  const loyaltyLeaderboard = usePoolStore(selectLoyaltyLeaderboard);
  const historical = usePoolStore(selectHistorical);
  const bitcoinPrice = usePoolStore(selectBitcoinPrice);
  const error = usePoolStore(selectPoolError);
  const period = usePoolStore((s) => s.historicalPeriod);
  const isLoading = usePoolStore((s) => s.isLoading);
  const isLoadingHistorical = usePoolStore((s) => s.isLoadingHistorical);
  const isLoadingLeaderboards = usePoolStore((s) => s.isLoadingLeaderboards);

  // Cache staleness checks
  const statsCache = usePoolStore((s) => s.stats);
  const historicalCache = usePoolStore((s) => s.historical);
  const difficultyLeaderboardCache = usePoolStore((s) => s.difficultyLeaderboard);

  // Actions
  const refreshAll = usePoolStore((s) => s.refreshAll);
  const fetchHistorical = usePoolStore((s) => s.fetchHistorical);
  const fetchLeaderboards = usePoolStore((s) => s.fetchLeaderboards);
  const setHistoricalPeriod = usePoolStore((s) => s.setHistoricalPeriod);
  const clearError = usePoolStore((s) => s.clearError);

  // User address for leaderboard highlighting
  const userAddress = useSettingsStore((s) => s.bitcoinAddress);

  // Initialize polling
  usePoolPolling();

  // Initial data fetch
  useEffect(() => {
    if (!stats) {
      refreshAll();
    }
    if (!historical) {
      fetchHistorical(period);
    }
    if (!difficultyLeaderboard) {
      fetchLeaderboards();
    }
  }, [stats, historical, difficultyLeaderboard, refreshAll, fetchHistorical, fetchLeaderboards, period]);

  // Determine skeleton display based on cache staleness
  const showStatsSkeleton = isCacheStale(statsCache) && isLoading && !stats;
  const showChartSkeleton = isCacheStale(historicalCache) && isLoadingHistorical && !historical;
  const showLeaderboardsSkeleton = isCacheStale(difficultyLeaderboardCache) && isLoadingLeaderboards && !difficultyLeaderboard;

  // Pull-to-refresh handler
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      refreshAll(),
      fetchHistorical(period),
      fetchLeaderboards(),
    ]);
    setRefreshing(false);
  }, [refreshAll, fetchHistorical, fetchLeaderboards, period]);

  // Period change handler
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

        {/* Main Hashrate Stat */}
        <View className="px-4 pt-4 pb-2">
          {showStatsSkeleton ? (
            <SkeletonStatItem />
          ) : (
            <StatItem
              icon="speedometer-outline"
              label="Pool Hashrate"
              value={stats?.hashrate ? formatHashrate(stats.hashrate) : '--'}
              size="lg"
            />
          )}
        </View>

        {/* Chart Section */}
        <View className="px-4 py-2">
          <TimePresetButtons
            selected={period}
            onSelect={handlePeriodChange}
            disabled={isLoadingHistorical}
            className="mb-3"
          />

          <Pressable onPress={openFullScreen} className="relative">
            <HashrateChart
              data={historical ?? []}
              period={period}
              isLoading={showChartSkeleton}
              height={200}
            />
            {/* Expand hint overlay */}
            <View className="absolute bottom-2 right-2 flex-row items-center bg-background/80 rounded-full px-2 py-1">
              <Ionicons name="expand-outline" size={14} color={colors.textMuted} />
              <Text variant="caption" color="muted" className="ml-1 text-xs">
                Tap to expand
              </Text>
            </View>
          </Pressable>
        </View>

        {/* Stats Grid */}
        <View className="px-4 py-4">
          <PoolStatsGrid
            stats={stats ?? null}
            bitcoinPrice={bitcoinPrice ?? null}
            isLoading={showStatsSkeleton}
          />
        </View>

        {/* Leaderboard */}
        <View className="px-4 pb-4">
          <LeaderboardCard
            difficultyEntries={difficultyLeaderboard ?? []}
            loyaltyEntries={loyaltyLeaderboard ?? []}
            userAddress={userAddress ?? undefined}
            isLoading={showLeaderboardsSkeleton}
          />
        </View>
      </ScrollView>

      {/* Full Screen Chart Modal */}
      <FullScreenChart
        visible={fullScreenVisible}
        onClose={closeFullScreen}
        data={historical ?? []}
        currentHashrate={stats?.hashrate}
        period={period}
        onPeriodChange={handlePeriodChange}
        isLoading={isLoadingHistorical}
      />
    </SafeAreaView>
  );
}
