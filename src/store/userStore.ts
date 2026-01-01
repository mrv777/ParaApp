/**
 * User store for personal Parasite Pool data
 */

import { create } from 'zustand';
import type {
  CachedData,
  ApiError,
  UserStats,
  UserHistoricalPoint,
  LeaderboardEntry,
  Account,
  HistoricalPeriod,
  HistoricalInterval,
} from '@/types';
import { parasite, isSuccess } from '@/api';
import { useSettingsStore } from './settingsStore';

interface UserState {
  // Cached data
  stats: CachedData<UserStats> | null;
  account: CachedData<Account> | null;
  historical: CachedData<UserHistoricalPoint[]> | null;
  userDiffs: CachedData<LeaderboardEntry[]> | null;

  // Current historical period
  historicalPeriod: HistoricalPeriod;

  // Loading states
  isLoading: boolean;
  isLoadingHistorical: boolean;

  // Error state
  error: ApiError | null;
}

interface UserActions {
  fetchUserStats: () => Promise<void>;
  fetchAccount: () => Promise<void>;
  fetchHistorical: (
    period: HistoricalPeriod,
    interval?: HistoricalInterval
  ) => Promise<void>;
  fetchUserDiffs: (limit?: number) => Promise<void>;
  toggleVisibility: () => Promise<void>;
  setHistoricalPeriod: (period: HistoricalPeriod) => void;
  clearError: () => void;
  clearUserData: () => void;
  refreshAll: () => Promise<void>;
}

const initialState: UserState = {
  stats: null,
  account: null,
  historical: null,
  userDiffs: null,
  historicalPeriod: '24h',
  isLoading: false,
  isLoadingHistorical: false,
  error: null,
};

/**
 * Calculate average hashrate from historical data points
 */
function calculateAverageHashrate(
  data: UserHistoricalPoint[],
  durationMs: number
): number | undefined {
  if (!data || data.length === 0) return undefined;

  const now = Date.now();
  const cutoff = now - durationMs;

  // Filter data points within the duration
  const relevantPoints = data.filter((point) => point.timestamp >= cutoff);

  if (relevantPoints.length === 0) return undefined;

  // Calculate average
  const sum = relevantPoints.reduce((acc, point) => acc + point.hashrate, 0);
  return sum / relevantPoints.length;
}

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

// Duration constants
const ONE_HOUR_MS = 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export const useUserStore = create<UserState & UserActions>()((set, get) => ({
  ...initialState,

  fetchUserStats: async () => {
    const address = useSettingsStore.getState().bitcoinAddress;
    if (!address) {
      set({ error: { message: 'No Bitcoin address configured' } });
      return;
    }

    set({ isLoading: true, error: null });

    // Fetch user stats and historical data in parallel
    const [userResult, historicalResult] = await Promise.all([
      parasite.getUser(address),
      parasite.getUserHistorical(address, '24h', '5m'),
    ]);

    if (isSuccess(userResult)) {
      let statsWithAverages = userResult.data;

      // Compute averages from historical data
      if (isSuccess(historicalResult) && historicalResult.data.length > 0) {
        const hashrate1h = calculateAverageHashrate(
          historicalResult.data,
          ONE_HOUR_MS
        );
        const hashrate24h = calculateAverageHashrate(
          historicalResult.data,
          TWENTY_FOUR_HOURS_MS
        );

        statsWithAverages = {
          ...userResult.data,
          hashrate1h,
          hashrate24h,
        };
      }

      set({
        stats: { data: statsWithAverages, timestamp: Date.now() },
        isLoading: false,
      });
    } else {
      set({ error: userResult.error, isLoading: false });
    }
  },

  fetchAccount: async () => {
    const address = useSettingsStore.getState().bitcoinAddress;
    if (!address) return;

    const result = await parasite.getAccount(address);

    if (isSuccess(result)) {
      set({
        account: { data: result.data, timestamp: Date.now() },
      });
    }
  },

  fetchHistorical: async (period, interval) => {
    const address = useSettingsStore.getState().bitcoinAddress;
    if (!address) return;

    set({ isLoadingHistorical: true, historicalPeriod: period });

    const actualInterval = interval || getIntervalForPeriod(period);
    const result = await parasite.getUserHistorical(
      address,
      period,
      actualInterval
    );

    if (isSuccess(result)) {
      set({
        historical: { data: result.data, timestamp: Date.now() },
        isLoadingHistorical: false,
      });
    } else {
      set({ error: result.error, isLoadingHistorical: false });
    }
  },

  fetchUserDiffs: async (limit = 50) => {
    const address = useSettingsStore.getState().bitcoinAddress;
    if (!address) return;

    const result = await parasite.getUserDiffs(address, limit);

    if (isSuccess(result)) {
      set({
        userDiffs: { data: result.data, timestamp: Date.now() },
      });
    }
  },

  toggleVisibility: async () => {
    const address = useSettingsStore.getState().bitcoinAddress;
    if (!address) return;

    const result = await parasite.toggleUserVisibility(address);

    if (isSuccess(result)) {
      // Update settings store
      useSettingsStore.getState().setPublicOnLeaderboard(result.data.isPublic);
      // Refresh user stats to get updated visibility
      get().fetchUserStats();
    } else {
      set({ error: result.error });
    }
  },

  setHistoricalPeriod: (period) => {
    set({ historicalPeriod: period });
    get().fetchHistorical(period);
  },

  clearError: () => set({ error: null }),

  clearUserData: () =>
    set({
      stats: null,
      account: null,
      historical: null,
      userDiffs: null,
      error: null,
    }),

  refreshAll: async () => {
    const address = useSettingsStore.getState().bitcoinAddress;
    if (!address) return;

    const { fetchUserStats, fetchAccount, fetchUserDiffs } = get();
    await Promise.all([fetchUserStats(), fetchAccount(), fetchUserDiffs()]);
  },
}));

// Stable empty array for selectors (prevents infinite loops)
const EMPTY_WORKERS: import('@/types').UserWorker[] = [];

// Selectors
export const selectUserStats = (state: UserState) => state.stats?.data;
export const selectUserAccount = (state: UserState) => state.account?.data;
export const selectUserWorkers = (state: UserState) =>
  state.stats?.data?.workers ?? EMPTY_WORKERS;
export const selectUserHistorical = (state: UserState) =>
  state.historical?.data;
export const selectUserDiffs = (state: UserState) => state.userDiffs?.data;
export const selectIsUserLoading = (state: UserState) => state.isLoading;
export const selectUserError = (state: UserState) => state.error;
