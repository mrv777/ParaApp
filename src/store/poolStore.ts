/**
 * Pool store for Parasite Pool data
 */

import { create } from 'zustand';
import type {
  CachedData,
  ApiError,
  PoolStats,
  PoolHistoricalPoint,
  DifficultyLeaderboardEntry,
  LoyaltyLeaderboardEntry,
  LeaderboardEntry,
  RoundSummary,
  RoundWorkLeaderboardEntry,
  HistoricalPeriod,
  HistoricalInterval,
} from '@/types';
import { parasite, mempool, isSuccess } from '@/api';
import { getIntervalForPeriod } from '@/utils/historical';

const NETWORK_DIFFICULTY_MAX_AGE_MS = 60 * 60 * 1000;

interface PoolState {
  // Cached data
  stats: CachedData<PoolStats> | null;
  historical: CachedData<PoolHistoricalPoint[]> | null;
  bitcoinPrice: CachedData<number> | null;
  networkDifficulty: CachedData<number> | null;
  difficultyLeaderboard: CachedData<DifficultyLeaderboardEntry[]> | null;
  loyaltyLeaderboard: CachedData<LoyaltyLeaderboardEntry[]> | null;
  roundDifficultyLeaderboard: CachedData<DifficultyLeaderboardEntry[]> | null;
  roundLoyaltyLeaderboard: CachedData<LoyaltyLeaderboardEntry[]> | null;
  roundWorkLeaderboard: CachedData<RoundWorkLeaderboardEntry[]> | null;
  blocks: CachedData<LeaderboardEntry[]> | null;
  rounds: CachedData<RoundSummary[]> | null;
  networkDifficultyLastAttempt: number | null;

  // Current historical period
  historicalPeriod: HistoricalPeriod;

  // Loading states
  isLoading: boolean;
  isLoadingHistorical: boolean;
  isLoadingLeaderboards: boolean;
  isLoadingRoundLeaderboards: boolean;
  isLoadingBlocks: boolean;
  isLoadingRounds: boolean;
  isLoadingNetworkDifficulty: boolean;

  // Error state
  error: ApiError | null;
}

interface PoolActions {
  fetchPoolStats: (options?: { silent?: boolean }) => Promise<void>;
  fetchLeaderboards: (limit?: number) => Promise<void>;
  fetchRoundLeaderboards: (limit?: number) => Promise<void>;
  fetchBlocks: (limit?: number) => Promise<void>;
  fetchRounds: () => Promise<void>;
  fetchHistorical: (period: HistoricalPeriod, interval?: HistoricalInterval) => Promise<void>;
  fetchBitcoinPrice: () => Promise<void>;
  fetchNetworkDifficulty: (options?: { force?: boolean }) => Promise<void>;
  setHistoricalPeriod: (period: HistoricalPeriod) => void;
  clearError: () => void;
  refreshAll: (options?: { forceNetworkDifficulty?: boolean }) => Promise<void>;
}

const initialState: PoolState = {
  stats: null,
  historical: null,
  bitcoinPrice: null,
  networkDifficulty: null,
  difficultyLeaderboard: null,
  loyaltyLeaderboard: null,
  roundDifficultyLeaderboard: null,
  roundLoyaltyLeaderboard: null,
  roundWorkLeaderboard: null,
  blocks: null,
  rounds: null,
  networkDifficultyLastAttempt: null,
  historicalPeriod: '24h',
  isLoading: false,
  isLoadingHistorical: false,
  isLoadingLeaderboards: false,
  isLoadingRoundLeaderboards: false,
  isLoadingBlocks: false,
  isLoadingRounds: false,
  isLoadingNetworkDifficulty: false,
  error: null,
};

export const usePoolStore = create<PoolState & PoolActions>()((set, get) => ({
  ...initialState,

  fetchPoolStats: async (options) => {
    // Show the loading state for user-initiated refreshes AND the very first
    // load (no cached data yet); stay silent for background polls once we have
    // data, so live values update in place without a skeleton flicker.
    if (!options?.silent || !get().stats) {
      set({ isLoading: true, error: null });
    } else {
      set({ error: null });
    }

    const result = await parasite.getPoolStats();

    if (isSuccess(result)) {
      set({
        stats: { data: result.data, timestamp: Date.now() },
        isLoading: false,
      });
    } else {
      set({ error: result.error, isLoading: false });
    }
  },

  fetchLeaderboards: async (limit = 420) => {
    set({ isLoadingLeaderboards: true });

    const [diffResult, loyaltyResult] = await Promise.all([
      parasite.getDifficultyLeaderboard(limit),
      parasite.getLoyaltyLeaderboard(limit),
    ]);

    const timestamp = Date.now();
    let hasError = false;

    if (isSuccess(diffResult)) {
      set({
        difficultyLeaderboard: { data: diffResult.data, timestamp },
      });
    } else {
      set({ error: diffResult.error });
      hasError = true;
    }

    if (isSuccess(loyaltyResult)) {
      set({
        loyaltyLeaderboard: { data: loyaltyResult.data, timestamp },
      });
    } else if (!hasError) {
      set({ error: loyaltyResult.error });
    }

    set({ isLoadingLeaderboards: false });
  },

  fetchRoundLeaderboards: async (limit = 420) => {
    set({ isLoadingRoundLeaderboards: true });

    const [diffResult, loyaltyResult, workResult] = await Promise.all([
      parasite.getDifficultyLeaderboard(limit, 'current'),
      parasite.getLoyaltyLeaderboard(limit, 'current'),
      parasite.getRoundWorkLeaderboard(limit),
    ]);

    const timestamp = Date.now();
    let hasError = false;

    if (isSuccess(diffResult)) {
      set({
        roundDifficultyLeaderboard: { data: diffResult.data, timestamp },
      });
    } else {
      set({ error: diffResult.error });
      hasError = true;
    }

    if (isSuccess(loyaltyResult)) {
      set({
        roundLoyaltyLeaderboard: { data: loyaltyResult.data, timestamp },
      });
    } else if (!hasError) {
      set({ error: loyaltyResult.error });
    }

    if (isSuccess(workResult)) {
      set({
        roundWorkLeaderboard: { data: workResult.data, timestamp },
      });
    }
    // Work leaderboard failures are non-critical — keep the last data silently

    set({ isLoadingRoundLeaderboards: false });
  },

  fetchBlocks: async (limit = 25) => {
    set({ isLoadingBlocks: true });

    const result = await parasite.getHighestDiffBlocks(limit);

    if (isSuccess(result)) {
      set({
        blocks: { data: result.data, timestamp: Date.now() },
        isLoadingBlocks: false,
      });
    } else {
      set({ error: result.error, isLoadingBlocks: false });
    }
  },

  fetchRounds: async () => {
    set({ isLoadingRounds: true });

    const result = await parasite.getRounds();

    if (isSuccess(result)) {
      set({
        rounds: { data: result.data, timestamp: Date.now() },
        isLoadingRounds: false,
      });
    } else {
      // Don't set error - the winning-diff stat is a non-critical enhancement
      set({ isLoadingRounds: false });
    }
  },

  fetchHistorical: async (period, interval) => {
    set({ isLoadingHistorical: true, historicalPeriod: period });

    const actualInterval = interval || getIntervalForPeriod(period);
    const result = await parasite.getPoolHistorical(period, actualInterval);

    // Skip if the selected period changed during the fetch — a slower
    // response for a deselected period must not overwrite the chart.
    if (get().historicalPeriod !== period) return;

    if (isSuccess(result)) {
      set({
        historical: { data: result.data, timestamp: Date.now() },
        isLoadingHistorical: false,
      });
    } else {
      set({ error: result.error, isLoadingHistorical: false });
    }
  },

  fetchBitcoinPrice: async () => {
    const result = await mempool.getUsdPrice();

    if (isSuccess(result)) {
      set({
        bitcoinPrice: { data: result.data, timestamp: Date.now() },
      });
    }
    // Don't set error for price fetch - it's not critical
  },

  fetchNetworkDifficulty: async (options) => {
    const { networkDifficulty, networkDifficultyLastAttempt, isLoadingNetworkDifficulty } = get();
    const now = Date.now();
    const isFresh =
      networkDifficulty && now - networkDifficulty.timestamp < NETWORK_DIFFICULTY_MAX_AGE_MS;
    const attemptedRecently =
      networkDifficultyLastAttempt != null &&
      now - networkDifficultyLastAttempt < NETWORK_DIFFICULTY_MAX_AGE_MS;

    // Both Home and Pool can mount the shared polling hook. The loading guard
    // deduplicates their first request, and the age guard keeps the otherwise
    // 10-second poll from refetching difficulty more than hourly.
    if (isLoadingNetworkDifficulty || (!options?.force && (isFresh || attemptedRecently))) {
      return;
    }

    set({
      isLoadingNetworkDifficulty: true,
      networkDifficultyLastAttempt: now,
    });
    const result = await mempool.getNetworkDifficulty();

    if (isSuccess(result)) {
      set({
        networkDifficulty: { data: result.data, timestamp: Date.now() },
        isLoadingNetworkDifficulty: false,
      });
    } else {
      // Network difficulty is non-critical; preserve any cached value and do
      // not replace the pool error banner with a mempool.space failure.
      set({ isLoadingNetworkDifficulty: false });
    }
  },

  setHistoricalPeriod: (period) => {
    set({ historicalPeriod: period });
    // Automatically fetch new data
    get().fetchHistorical(period);
  },

  clearError: () => set({ error: null }),

  refreshAll: async (options) => {
    const {
      fetchPoolStats,
      fetchLeaderboards,
      fetchRoundLeaderboards,
      fetchBlocks,
      fetchBitcoinPrice,
      fetchNetworkDifficulty,
    } = get();
    await Promise.all([
      fetchPoolStats(),
      fetchLeaderboards(),
      fetchRoundLeaderboards(),
      fetchBlocks(),
      fetchBitcoinPrice(),
      fetchNetworkDifficulty({ force: options?.forceNetworkDifficulty }),
    ]);
  },
}));

// Selectors
export const selectPoolStats = (state: PoolState) => state.stats?.data;
export const selectDifficultyLeaderboard = (state: PoolState) => state.difficultyLeaderboard?.data;
export const selectLoyaltyLeaderboard = (state: PoolState) => state.loyaltyLeaderboard?.data;
export const selectRoundDifficultyLeaderboard = (state: PoolState) =>
  state.roundDifficultyLeaderboard?.data;
export const selectRoundLoyaltyLeaderboard = (state: PoolState) =>
  state.roundLoyaltyLeaderboard?.data;
export const selectRoundWorkLeaderboard = (state: PoolState) => state.roundWorkLeaderboard?.data;
export const selectBlocks = (state: PoolState) => state.blocks?.data;
export const selectRounds = (state: PoolState) => state.rounds?.data;
export const selectHistorical = (state: PoolState) => state.historical?.data;
export const selectBitcoinPrice = (state: PoolState) => state.bitcoinPrice?.data;
export const selectNetworkDifficulty = (state: PoolState) => state.networkDifficulty?.data;
export const selectIsPoolLoading = (state: PoolState) => state.isLoading;
export const selectPoolError = (state: PoolState) => state.error;

/**
 * Check if cached data is stale (>1 hour old)
 */
export function isCacheStale<T>(cached: CachedData<T> | null): boolean {
  if (!cached) return true;
  const oneHour = 60 * 60 * 1000;
  return Date.now() - cached.timestamp > oneHour;
}
