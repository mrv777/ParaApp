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
  HistoricalPeriod,
  HistoricalInterval,
} from '@/types';
import { parasite, isSuccess } from '@/api';
import { useSettingsStore } from './settingsStore';

interface UserState {
  // Cached data
  stats: CachedData<UserStats> | null;
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
  historical: null,
  userDiffs: null,
  historicalPeriod: '24h',
  isLoading: false,
  isLoadingHistorical: false,
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

export const useUserStore = create<UserState & UserActions>()((set, get) => ({
  ...initialState,

  fetchUserStats: async () => {
    const address = useSettingsStore.getState().bitcoinAddress;
    if (!address) {
      set({ error: { message: 'No Bitcoin address configured' } });
      return;
    }

    set({ isLoading: true, error: null });

    const result = await parasite.getUser(address);

    if (isSuccess(result)) {
      set({
        stats: { data: result.data, timestamp: Date.now() },
        isLoading: false,
      });
    } else {
      set({ error: result.error, isLoading: false });
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
      historical: null,
      userDiffs: null,
      error: null,
    }),

  refreshAll: async () => {
    const address = useSettingsStore.getState().bitcoinAddress;
    if (!address) return;

    const { fetchUserStats, fetchUserDiffs } = get();
    await Promise.all([fetchUserStats(), fetchUserDiffs()]);
  },
}));

// Stable empty array for selectors (prevents infinite loops)
const EMPTY_WORKERS: import('@/types').UserWorker[] = [];

// Selectors
export const selectUserStats = (state: UserState) => state.stats?.data;
export const selectUserWorkers = (state: UserState) =>
  state.stats?.data?.workers ?? EMPTY_WORKERS;
export const selectUserHistorical = (state: UserState) =>
  state.historical?.data;
export const selectUserDiffs = (state: UserState) => state.userDiffs?.data;
export const selectIsUserLoading = (state: UserState) => state.isLoading;
export const selectUserError = (state: UserState) => state.error;
