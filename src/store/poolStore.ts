/**
 * Pool store for Parasite Pool data
 */

import { create } from 'zustand';
import type {
  CachedData,
  ApiError,
  PoolStats,
  PoolBlock,
  PoolHistoricalPoint,
  LeaderboardEntry,
  DifficultyLeaderboardEntry,
  LoyaltyLeaderboardEntry,
  HistoricalPeriod,
  HistoricalInterval,
} from '@/types';
import { parasite, mempool, isSuccess } from '@/api';
import { getIntervalForPeriod } from '@/utils/historical';

interface PoolState {
  // Cached data
  stats: CachedData<PoolStats> | null;
  blocks: CachedData<PoolBlock[]> | null;
  leaderboard: CachedData<LeaderboardEntry[]> | null;
  historical: CachedData<PoolHistoricalPoint[]> | null;
  bitcoinPrice: CachedData<number> | null;
  difficultyLeaderboard: CachedData<DifficultyLeaderboardEntry[]> | null;
  loyaltyLeaderboard: CachedData<LoyaltyLeaderboardEntry[]> | null;

  // Current historical period
  historicalPeriod: HistoricalPeriod;

  // Loading states
  isLoading: boolean;
  isLoadingHistorical: boolean;
  isLoadingLeaderboard: boolean;
  isLoadingLeaderboards: boolean;

  // Error state
  error: ApiError | null;
}

interface PoolActions {
  fetchPoolStats: (options?: { silent?: boolean }) => Promise<void>;
  fetchLeaderboard: (limit?: number) => Promise<void>;
  fetchLeaderboards: (limit?: number) => Promise<void>;
  fetchHistorical: (
    period: HistoricalPeriod,
    interval?: HistoricalInterval
  ) => Promise<void>;
  fetchBitcoinPrice: () => Promise<void>;
  setHistoricalPeriod: (period: HistoricalPeriod) => void;
  clearError: () => void;
  refreshAll: () => Promise<void>;
}

const initialState: PoolState = {
  stats: null,
  blocks: null,
  leaderboard: null,
  historical: null,
  bitcoinPrice: null,
  difficultyLeaderboard: null,
  loyaltyLeaderboard: null,
  historicalPeriod: '24h',
  isLoading: false,
  isLoadingHistorical: false,
  isLoadingLeaderboard: false,
  isLoadingLeaderboards: false,
  error: null,
};

export const usePoolStore = create<PoolState & PoolActions>()((set, get) => ({
  ...initialState,

  fetchPoolStats: async (options) => {
    // Only show loading indicator for user-initiated refresh, not background polls
    if (!options?.silent) {
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

  fetchLeaderboard: async (limit = 100) => {
    set({ isLoadingLeaderboard: true });

    const result = await parasite.getLeaderboard(limit);

    if (isSuccess(result)) {
      set({
        leaderboard: { data: result.data, timestamp: Date.now() },
        isLoadingLeaderboard: false,
      });
    } else {
      set({ error: result.error, isLoadingLeaderboard: false });
    }
  },

  fetchLeaderboards: async (limit = 100) => {
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

  fetchHistorical: async (period, interval) => {
    set({ isLoadingHistorical: true, historicalPeriod: period });

    const actualInterval = interval || getIntervalForPeriod(period);
    const result = await parasite.getPoolHistorical(period, actualInterval);

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

  setHistoricalPeriod: (period) => {
    set({ historicalPeriod: period });
    // Automatically fetch new data
    get().fetchHistorical(period);
  },

  clearError: () => set({ error: null }),

  refreshAll: async () => {
    const { fetchPoolStats, fetchLeaderboard, fetchLeaderboards, fetchBitcoinPrice } = get();
    await Promise.all([
      fetchPoolStats(),
      fetchLeaderboard(),
      fetchLeaderboards(),
      fetchBitcoinPrice(),
    ]);
  },
}));

// Selectors
export const selectPoolStats = (state: PoolState) => state.stats?.data;
export const selectLeaderboard = (state: PoolState) => state.leaderboard?.data;
export const selectDifficultyLeaderboard = (state: PoolState) =>
  state.difficultyLeaderboard?.data;
export const selectLoyaltyLeaderboard = (state: PoolState) =>
  state.loyaltyLeaderboard?.data;
export const selectHistorical = (state: PoolState) => state.historical?.data;
export const selectBitcoinPrice = (state: PoolState) =>
  state.bitcoinPrice?.data;
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
