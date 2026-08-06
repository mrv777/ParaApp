/**
 * User store for personal Parasite Pool data
 */

import { create } from 'zustand';
import type {
  CachedData,
  ApiError,
  UserStats,
  UserHistoricalPoint,
  UserDifficultyHit,
  UserRoundsResponse,
  BadgesPayload,
  RefineryOrderSummary,
  Account,
  HistoricalPeriod,
  HistoricalInterval,
} from '@/types';
import { parasite, refinery, isSuccess } from '@/api';
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
  difficultyHits: CachedData<UserDifficultyHit[]> | null;
  difficultyHitsAddress: string | null;
  rounds: CachedData<UserRoundsResponse> | null;
  // `data: null` = no badges / private profile (badge UI hidden, not an error)
  badges: CachedData<BadgesPayload | null> | null;
  refineryOrders: CachedData<RefineryOrderSummary[]> | null;

  // Current historical period
  historicalPeriod: HistoricalPeriod;

  // Loading states
  isLoading: boolean;
  isLoadingHistorical: boolean;
  isLoadingDifficultyHits: boolean;
  difficultyHitsLastAttempt: number | null;

  // Error state
  error: ApiError | null;
}

interface UserActions {
  fetchUserStats: (options?: { silent?: boolean }) => Promise<void>;
  fetchAccount: () => Promise<void>;
  fetchRounds: () => Promise<void>;
  fetchBadges: (options?: { force?: boolean }) => Promise<void>;
  fetchRefineryOrders: () => Promise<void>;
  fetchDifficultyHits: (options?: { force?: boolean }) => Promise<void>;
  fetchHistorical: (period: HistoricalPeriod, interval?: HistoricalInterval) => Promise<void>;
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
  difficultyHits: null,
  difficultyHitsAddress: null,
  rounds: null,
  badges: null,
  refineryOrders: null,
  historicalPeriod: '24h',
  isLoading: false,
  isLoadingHistorical: false,
  isLoadingDifficultyHits: false,
  difficultyHitsLastAttempt: null,
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
const DIFFICULTY_HITS_MAX_AGE_MS = 5 * 60 * 1000;
// Badges change only on new blocks / claims and the server caches them ~60s,
// so polling refetches are throttled well below the poll interval.
const BADGES_MAX_AGE_MS = 5 * 60 * 1000;

function historicalSeriesEqual(
  a: UserHistoricalPoint[] | undefined,
  b: UserHistoricalPoint[]
): boolean {
  if (!a || a.length !== b.length) return false;
  return a.every(
    (point, index) => point.timestamp === b[index].timestamp && point.hashrate === b[index].hashrate
  );
}

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
        const hashrate1h = calculateAverageHashrate(historicalResult.data, ONE_HOUR_MS);
        const hashrate24h = calculateAverageHashrate(historicalResult.data, TWENTY_FOUR_HOURS_MS);

        statsWithAverages = {
          ...userResult.data,
          hashrate1h,
          hashrate24h,
        };
      }

      const fetchedAt = Date.now();
      const currentState = get();
      const shouldRefreshChart =
        isSuccess(historicalResult) &&
        currentState.historicalPeriod === '24h' &&
        !historicalSeriesEqual(currentState.historical?.data, historicalResult.data);

      set({
        stats: { data: statsWithAverages, timestamp: fetchedAt },
        statsAddress: address,
        // The polling request already downloaded this exact series for the
        // averages. Reuse it for the default chart instead of leaving the
        // chart frozen at its mount-time snapshot.
        ...(shouldRefreshChart && isSuccess(historicalResult)
          ? {
              historical: {
                data: historicalResult.data,
                timestamp: fetchedAt,
              },
            }
          : {}),
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

  fetchBadges: async (options) => {
    const address = useSettingsStore.getState().bitcoinAddress;
    if (!address) return;

    // Skip while cached data is fresh (address changes clear the cache via
    // clearUserData, so freshness implies the current address).
    const { badges } = get();
    if (
      !options?.force &&
      badges != null &&
      Date.now() - badges.timestamp < BADGES_MAX_AGE_MS
    ) {
      return;
    }

    const result = await parasite.getUserBadges(address);

    // Skip if address changed during fetch
    if (useSettingsStore.getState().bitcoinAddress !== address) return;

    // Only update on success, preserving the last known value through transient
    // failures. `data: null` (no badges / private profile) IS a success and
    // clears any previous payload.
    if (isSuccess(result)) {
      set({
        badges: { data: result.data, timestamp: Date.now() },
      });
    }
  },

  fetchRefineryOrders: async () => {
    const address = useSettingsStore.getState().bitcoinAddress;
    if (!address) return;

    const result = await refinery.getRefineryOrders(address);

    // Skip if address changed during fetch
    if (useSettingsStore.getState().bitcoinAddress !== address) return;

    // Only update on success so the orders list survives transient failures;
    // address changes are handled by clearUserData().
    if (isSuccess(result)) {
      set({
        refineryOrders: { data: result.data, timestamp: Date.now() },
      });
    }
  },

  fetchDifficultyHits: async (options) => {
    const address = useSettingsStore.getState().bitcoinAddress;
    if (!address) return;

    const now = Date.now();
    const {
      difficultyHits,
      difficultyHitsAddress,
      difficultyHitsLastAttempt,
      isLoadingDifficultyHits,
    } = get();
    const cacheIsFresh =
      difficultyHitsAddress === address &&
      difficultyHits != null &&
      now - difficultyHits.timestamp < DIFFICULTY_HITS_MAX_AGE_MS;
    const attemptedRecently =
      difficultyHitsAddress === address &&
      difficultyHitsLastAttempt != null &&
      now - difficultyHitsLastAttempt < DIFFICULTY_HITS_MAX_AGE_MS;

    if (isLoadingDifficultyHits || (!options?.force && (cacheIsFresh || attemptedRecently))) {
      return;
    }

    set({
      isLoadingDifficultyHits: true,
      difficultyHitsAddress: address,
      difficultyHitsLastAttempt: now,
    });
    const result = await parasite.getUserDifficultyHits(address, 500);

    // A late response must never attach one wallet's hits to another wallet.
    if (useSettingsStore.getState().bitcoinAddress !== address) {
      if (get().difficultyHitsAddress === address) {
        set({ isLoadingDifficultyHits: false });
      }
      return;
    }

    if (isSuccess(result)) {
      set({
        difficultyHits: { data: result.data, timestamp: Date.now() },
        difficultyHitsAddress: address,
        isLoadingDifficultyHits: false,
      });
    } else {
      // This enhancement is non-critical. Keep any stale markers and do not
      // replace the primary user error shown on Home.
      set({ isLoadingDifficultyHits: false });
    }
  },

  fetchHistorical: async (period, interval) => {
    const address = useSettingsStore.getState().bitcoinAddress;
    if (!address) return;

    set({ isLoadingHistorical: true, historicalPeriod: period });

    const actualInterval = interval || getIntervalForPeriod(period);
    const result = await parasite.getUserHistorical(address, period, actualInterval);

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
      difficultyHits: null,
      difficultyHitsAddress: null,
      rounds: null,
      badges: null,
      refineryOrders: null,
      isLoading: false,
      isLoadingHistorical: false,
      isLoadingDifficultyHits: false,
      difficultyHitsLastAttempt: null,
      error: null,
    }),

  refreshAll: async () => {
    const address = useSettingsStore.getState().bitcoinAddress;
    if (!address) return;

    const {
      fetchUserStats,
      fetchAccount,
      fetchRounds,
      fetchBadges,
      fetchRefineryOrders,
      fetchDifficultyHits,
    } = get();
    await Promise.all([
      fetchUserStats(),
      fetchAccount(),
      fetchRounds(),
      fetchBadges({ force: true }),
      fetchRefineryOrders(),
      fetchDifficultyHits({ force: true }),
    ]);
  },
}));

// Stable empty array for selectors (prevents infinite loops)
const EMPTY_WORKERS: import('@/types').UserWorker[] = [];
const EMPTY_DIFFICULTY_HITS: UserDifficultyHit[] = [];

// Selectors
export const selectUserStats = (state: UserState) => state.stats?.data;
export const selectUserAccount = (state: UserState) => state.account?.data;
export const selectUserWorkers = (state: UserState) => state.stats?.data?.workers ?? EMPTY_WORKERS;
export const selectUserHistorical = (state: UserState) => state.historical?.data;
export const selectUserDifficultyHits = (state: UserState) =>
  state.difficultyHits?.data ?? EMPTY_DIFFICULTY_HITS;
export const selectUserRounds = (state: UserState) => state.rounds?.data;
export const selectUserBadges = (state: UserState) => state.badges?.data ?? null;
export const selectRefineryOrders = (state: UserState) => state.refineryOrders?.data;
export const selectIsUserLoading = (state: UserState) => state.isLoading;
export const selectUserError = (state: UserState) => state.error;
