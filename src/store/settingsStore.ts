/**
 * Settings store with AsyncStorage persistence
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TemperatureUnit } from '@/utils/formatting';
import type { MinerSortOption, MinerFilterOption } from '@/types';

export type PollingInterval = 5000 | 10000 | 20000 | 30000;
export type WorkerSortOrder = 'hashrate' | 'name' | 'bestDiff';

interface SettingsState {
  // User preferences
  temperatureUnit: TemperatureUnit;
  pollingInterval: PollingInterval;
  workerSortOrder: WorkerSortOrder;
  minerSortBy: MinerSortOption;
  minerFilterBy: MinerFilterOption;

  // User Bitcoin address (persisted)
  bitcoinAddress: string | null;

  // Visibility on leaderboards
  isPublicOnLeaderboard: boolean;

  // Dismissed tips (persisted)
  dismissedTips: string[];

  // Cache timestamps
  lastPoolFetch: number | null;
  lastUserFetch: number | null;

  // Hydration state
  isHydrated: boolean;
}

interface SettingsActions {
  setTemperatureUnit: (unit: TemperatureUnit) => void;
  setPollingInterval: (interval: PollingInterval) => void;
  setWorkerSortOrder: (order: WorkerSortOrder) => void;
  setMinerSortBy: (sort: MinerSortOption) => void;
  setMinerFilterBy: (filter: MinerFilterOption) => void;
  setBitcoinAddress: (address: string | null) => void;
  setPublicOnLeaderboard: (isPublic: boolean) => void;
  dismissTip: (tipId: string) => void;
  updateCacheTimestamp: (type: 'pool' | 'user') => void;
  setHydrated: (hydrated: boolean) => void;
}

const initialState: SettingsState = {
  temperatureUnit: 'celsius',
  pollingInterval: 10000,
  workerSortOrder: 'hashrate',
  minerSortBy: 'status',
  minerFilterBy: 'all',
  bitcoinAddress: null,
  isPublicOnLeaderboard: true,
  dismissedTips: [],
  lastPoolFetch: null,
  lastUserFetch: null,
  isHydrated: false,
};

export const useSettingsStore = create<SettingsState & SettingsActions>()(
  persist(
    (set) => ({
      ...initialState,

      setTemperatureUnit: (unit) => set({ temperatureUnit: unit }),

      setPollingInterval: (interval) => set({ pollingInterval: interval }),

      setWorkerSortOrder: (order) => set({ workerSortOrder: order }),

      setMinerSortBy: (sort) => set({ minerSortBy: sort }),

      setMinerFilterBy: (filter) => set({ minerFilterBy: filter }),

      setBitcoinAddress: (address) => set({ bitcoinAddress: address }),

      setPublicOnLeaderboard: (isPublic) =>
        set({ isPublicOnLeaderboard: isPublic }),

      dismissTip: (tipId) =>
        set((state) => ({
          dismissedTips: state.dismissedTips.includes(tipId)
            ? state.dismissedTips
            : [...state.dismissedTips, tipId],
        })),

      updateCacheTimestamp: (type) => {
        const timestamp = Date.now();
        if (type === 'pool') {
          set({ lastPoolFetch: timestamp });
        } else {
          set({ lastUserFetch: timestamp });
        }
      },

      setHydrated: (hydrated) => set({ isHydrated: hydrated }),
    }),
    {
      name: 'parasite-settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        temperatureUnit: state.temperatureUnit,
        pollingInterval: state.pollingInterval,
        workerSortOrder: state.workerSortOrder,
        minerSortBy: state.minerSortBy,
        minerFilterBy: state.minerFilterBy,
        bitcoinAddress: state.bitcoinAddress,
        isPublicOnLeaderboard: state.isPublicOnLeaderboard,
        dismissedTips: state.dismissedTips,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    }
  )
);

// Selectors
export const selectTemperatureUnit = (state: SettingsState) =>
  state.temperatureUnit;
export const selectPollingInterval = (state: SettingsState) =>
  state.pollingInterval;
export const selectBitcoinAddress = (state: SettingsState) =>
  state.bitcoinAddress;
export const selectIsHydrated = (state: SettingsState) => state.isHydrated;
export const selectHasAddress = (state: SettingsState) =>
  state.bitcoinAddress !== null && state.bitcoinAddress.length > 0;
export const selectWorkerSortOrder = (state: SettingsState) =>
  state.workerSortOrder;
