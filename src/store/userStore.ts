/**
 * User store for personal Parasite Pool data
 */

import { create } from 'zustand';
import type {
  CachedData,
  ApiError,
  UserStats,
  UserHistoricalPoint,
  UserRoundsResponse,
  Account,
  HistoricalPeriod,
  HistoricalInterval,
} from '@/types';
import { parasite, isSuccess } from '@/api';
import { getIntervalForPeriod } from '@/utils/historical';
import { useSettingsStore } from './settingsStore';

interface UserState {
  // Cached data
  stats: CachedData<UserStats> | null;
  // Address the cached `stats` belong to (guards against pairing a new address
  // with a previous address's stats, e.g. in the widget update path).
  statsAddress: string | null;
  account: CachedData<Account | null> | null;
  historical: CachedData<UserHistoricalPoint[]> | null;
  rounds: CachedData<UserRoundsResponse> | null;
  refineryBadge: CachedData<boolean> | null;

  // Current historical period
  historicalPeriod: HistoricalPeriod;

  // Loading states
  isLoading: boolean;
  isLoadingHistorical: boolean;

  // Error state
  error: ApiError | null;
}

interface UserActions {
  fetchUserStats: (options?: { silent?: boolean }) => Promise<void>;
  fetchAccount: () => Promise<void>;
  fetchRounds: () => Promise<void>;
  fetchRefineryBadge: () => Promise<void>;
  fetchHistorical: (
    period: HistoricalPeriod,
    interval?: HistoricalInterval
  ) => Promise<void>;
  setHistoricalPeriod: (period: HistoricalPeriod) => void;
  clearError: () => void;
  clearUserData: () => void;
  refreshAll: () => Promise<void>;
}

const initialState: UserState = {
  stats: null,
  statsAddress: null,
  account: null,
  historical: null,
  rounds: null,
  refineryBadge: null,
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

// Duration constants
const ONE_HOUR_MS = 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export const useUserStore = create<UserState & UserActions>()((set, get) => ({
  ...initialState,

  fetchUserStats: async (options) => {
    const address = useSettingsStore.getState().bitcoinAddress;
    if (!address) {
      set({ error: { message: 'No Bitcoin address configured' } });
      return;
    }

    // Show the loading state for user-initiated refreshes AND the very first
    // load (no cached data yet); stay silent for background polls once we have
    // data, so live values update in place without a skeleton flicker.
    if (!options?.silent || !get().stats) {
      set({ isLoading: true, error: null });
    } else {
      set({ error: null });
    }

    // Fetch user stats and historical data in parallel
    const [userResult, historicalResult] = await Promise.all([
      parasite.getUser(address),
      parasite.getUserHistorical(address, '24h', '5m'),
    ]);

    // Skip if address changed during fetch
    if (useSettingsStore.getState().bitcoinAddress !== address) return;

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
        statsAddress: address,
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

    // Skip if address changed during fetch
    if (useSettingsStore.getState().bitcoinAddress !== address) return;

    if (isSuccess(result)) {
      set({
        account: { data: result.data, timestamp: Date.now() },
      });
    }
  },

  fetchRounds: async () => {
    const address = useSettingsStore.getState().bitcoinAddress;
    if (!address) return;

    // Cap at 20 recent rounds (matches the website); the card collapses to a
    // few of these by default with a "Show all" toggle.
    const result = await parasite.getUserRounds(address, 20);

    // Skip if address changed during fetch
    if (useSettingsStore.getState().bitcoinAddress !== address) return;

    if (isSuccess(result)) {
      set({
        rounds: { data: result.data, timestamp: Date.now() },
      });
    }
  },

  fetchRefineryBadge: async () => {
    const address = useSettingsStore.getState().bitcoinAddress;
    if (!address) return;

    const result = await parasite.getRefineryOperatorBadge(address);

    // Skip if address changed during fetch
    if (useSettingsStore.getState().bitcoinAddress !== address) return;

    // Only update on success, preserving the last known value through transient
    // failures. The endpoint returns success+false for users without the badge,
    // so this still clears it for non-holders; address changes are handled by
    // clearUserData().
    if (isSuccess(result)) {
      set({
        refineryBadge: { data: result.data, timestamp: Date.now() },
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

    // Skip if address changed during fetch
    if (useSettingsStore.getState().bitcoinAddress !== address) return;
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

  setHistoricalPeriod: (period) => {
    set({ historicalPeriod: period });
    get().fetchHistorical(period);
  },

  clearError: () => set({ error: null }),

  clearUserData: () =>
    set({
      stats: null,
      statsAddress: null,
      account: null,
      historical: null,
      rounds: null,
      refineryBadge: null,
      isLoading: false,
      isLoadingHistorical: false,
      error: null,
    }),

  refreshAll: async () => {
    const address = useSettingsStore.getState().bitcoinAddress;
    if (!address) return;

    const { fetchUserStats, fetchAccount, fetchRounds, fetchRefineryBadge } =
      get();
    await Promise.all([
      fetchUserStats(),
      fetchAccount(),
      fetchRounds(),
      fetchRefineryBadge(),
    ]);
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
export const selectUserRounds = (state: UserState) => state.rounds?.data;
export const selectRefineryBadge = (state: UserState) =>
  state.refineryBadge?.data ?? false;
export const selectIsUserLoading = (state: UserState) => state.isLoading;
export const selectUserError = (state: UserState) => state.error;
