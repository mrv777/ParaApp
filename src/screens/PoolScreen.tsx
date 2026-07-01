/**
 * PoolScreen - Pool monitoring with stats, charts, and leaderboards
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ErrorBanner,
  FullScreenChart,
  PoolHashrateCard,
  PoolStatsGrid,
  LeaderboardCard,
  BlocksList,
} from '@/components';
import { usePoolPolling, usePolling } from '@/hooks';
import {
  usePoolStore,
  selectPoolStats,
  selectDifficultyLeaderboard,
  selectLoyaltyLeaderboard,
  selectRoundDifficultyLeaderboard,
  selectRoundLoyaltyLeaderboard,
  selectBlocks,
  selectHistorical,
  selectBitcoinPrice,
  selectPoolError,
  isCacheStale,
} from '@/store/poolStore';
import { useSettingsStore } from '@/store/settingsStore';
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
  const roundDifficultyLeaderboard = usePoolStore(selectRoundDifficultyLeaderboard);
  const roundLoyaltyLeaderboard = usePoolStore(selectRoundLoyaltyLeaderboard);
  const blocks = usePoolStore(selectBlocks);
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
  const fetchRoundLeaderboards = usePoolStore((s) => s.fetchRoundLeaderboards);
  const fetchBlocks = usePoolStore((s) => s.fetchBlocks);
  const isLoadingBlocks = usePoolStore((s) => s.isLoadingBlocks);
  const setHistoricalPeriod = usePoolStore((s) => s.setHistoricalPeriod);
  const clearError = usePoolStore((s) => s.clearError);

  // User address for leaderboard highlighting
  const userAddress = useSettingsStore((s) => s.bitcoinAddress);

  // Initialize polling
  usePoolPolling();

  // Poll round leaderboards only while Pool tab is focused (tabs don't unmount on blur)
  // immediate: true so data refreshes instantly on tab refocus; 60s interval (round data changes infrequently)
  const isFocused = useIsFocused();
  const onPollRoundLeaderboards = useCallback(async () => {
    await Promise.all([fetchRoundLeaderboards(), fetchBlocks()]);
  }, [fetchRoundLeaderboards, fetchBlocks]);
  usePolling({ onPoll: onPollRoundLeaderboards, immediate: true, enabled: isFocused, interval: 60000 });

  // Cold start: refreshAll with loading indicators (subsequent polls are silent)
  const hasMountFetched = useRef(false);
  useEffect(() => {
    if (!hasMountFetched.current) {
      hasMountFetched.current = true;
      refreshAll();
    } else {
      // Re-runs: only fill in missing data individually
      if (!difficultyLeaderboard) {
        fetchLeaderboards();
      }
    }
    if (!historical) {
      fetchHistorical(period);
    }
  }, [difficultyLeaderboard, historical, refreshAll, fetchLeaderboards, fetchHistorical, period]);

  const isLoadingRoundLeaderboards = usePoolStore((s) => s.isLoadingRoundLeaderboards);

  // Determine skeleton display based on cache staleness
  const showStatsSkeleton = isCacheStale(statsCache) && isLoading && !stats;
  const showChartSkeleton = isCacheStale(historicalCache) && isLoadingHistorical && !historical;
  const showLeaderboardsSkeleton =
    (isCacheStale(difficultyLeaderboardCache) && isLoadingLeaderboards && !difficultyLeaderboard) ||
    (isLoadingRoundLeaderboards && !roundDifficultyLeaderboard);

  // Pull-to-refresh handler (refreshAll covers stats + leaderboards + round leaderboards + price)
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      refreshAll(),
      fetchHistorical(period),
    ]);
    setRefreshing(false);
  }, [refreshAll, fetchHistorical, period]);

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
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 100, gap: 16 }}
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
          <ErrorBanner message={error.message} onRetry={handleRefresh} onDismiss={clearError} />
        )}

        {/* Pool hashrate hero + time range + chart */}
        <PoolHashrateCard
          hashrate={stats?.hashrate}
          period={period}
          historical={historical ?? []}
          onPeriodChange={handlePeriodChange}
          isLoadingHistorical={showChartSkeleton}
          onExpand={openFullScreen}
        />

        {/* Pool stats grid */}
        <PoolStatsGrid
          stats={stats ?? null}
          bitcoinPrice={bitcoinPrice ?? null}
          isLoading={showStatsSkeleton}
        />

        {/* Leaderboard — self-contained card with a bounded internal scroll */}
        <LeaderboardCard
          difficultyEntries={difficultyLeaderboard ?? []}
          loyaltyEntries={loyaltyLeaderboard ?? []}
          roundDifficultyEntries={roundDifficultyLeaderboard ?? []}
          roundLoyaltyEntries={roundLoyaltyLeaderboard ?? []}
          userAddress={userAddress ?? undefined}
          totalMembers={stats?.users}
          isLoading={showLeaderboardsSkeleton}
        />

        {/* Best Shares — highest diff submitted by a pool member per block */}
        <BlocksList
          blocks={blocks ?? []}
          isLoading={isLoadingBlocks && !blocks}
          maxItems={10}
        />
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
