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
  HistoricalPeriod,
  HistoricalInterval,
} from '@/types';
import { parasite, mempool, isSuccess } from '@/api';

interface PoolState {
  // Cached data
  stats: CachedData<PoolStats> | null;
  blocks: CachedData<PoolBlock[]> | null;
  leaderboard: CachedData<LeaderboardEntry[]> | null;
  historical: CachedData<PoolHistoricalPoint[]> | null;
  bitcoinPrice: CachedData<number> | null;

  // Current historical period
  historicalPeriod: HistoricalPeriod;

  // Loading states
  isLoading: boolean;
  isLoadingHistorical: boolean;
  isLoadingLeaderboard: boolean;

  // Error state
  error: ApiError | null;
}

interface PoolActions {
  fetchPoolStats: () => Promise<void>;
  fetchLeaderboard: (limit?: number) => Promise<void>;
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
  historicalPeriod: '24h',
  isLoading: false,
  isLoadingHistorical: false,
  isLoadingLeaderboard: false,
  error: null,
};

/**
 * Get appropriate interval for a given period
 */
function getIntervalForPeriod(period: HistoricalPeriod): HistoricalInterval {
  switch (period) {
    case '1h':
      return '5m';
    case '24h':
      return '15m';
    case '7d':
      return '1h';
    case '30d':
      return '4h';
    default:
      return '15m';
  }
}

export const usePoolStore = create<PoolState & PoolActions>()((set, get) => ({
  ...initialState,

  fetchPoolStats: async () => {
    set({ isLoading: true, error: null });

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

  fetchLeaderboard: async (limit = 50) => {
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
    const { fetchPoolStats, fetchLeaderboard, fetchBitcoinPrice } = get();
    await Promise.all([
      fetchPoolStats(),
      fetchLeaderboard(),
      fetchBitcoinPrice(),
    ]);
  },
}));

// Selectors
export const selectPoolStats = (state: PoolState) => state.stats?.data;
export const selectLeaderboard = (state: PoolState) => state.leaderboard?.data;
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
