/**
 * Settings store with AsyncStorage persistence
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TemperatureUnit } from '@/utils/formatting';

export type PollingInterval = 5000 | 10000 | 20000 | 30000;
export type WorkerSortOrder = 'hashrate' | 'name' | 'bestDiff';

interface SettingsState {
  // User preferences
  temperatureUnit: TemperatureUnit;
  pollingInterval: PollingInterval;
  workerSortOrder: WorkerSortOrder;

  // User Bitcoin address (persisted)
  bitcoinAddress: string | null;

  // Visibility on leaderboards
  isPublicOnLeaderboard: boolean;

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
  setBitcoinAddress: (address: string | null) => void;
  setPublicOnLeaderboard: (isPublic: boolean) => void;
  updateCacheTimestamp: (type: 'pool' | 'user') => void;
  setHydrated: (hydrated: boolean) => void;
}

const initialState: SettingsState = {
  temperatureUnit: 'celsius',
  pollingInterval: 10000,
  workerSortOrder: 'hashrate',
  bitcoinAddress: null,
  isPublicOnLeaderboard: true,
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

      setBitcoinAddress: (address) => set({ bitcoinAddress: address }),

      setPublicOnLeaderboard: (isPublic) =>
        set({ isPublicOnLeaderboard: isPublic }),

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
        bitcoinAddress: state.bitcoinAddress,
        isPublicOnLeaderboard: state.isPublicOnLeaderboard,
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
