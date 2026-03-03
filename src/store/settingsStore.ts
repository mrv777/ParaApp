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
export type Language = 'auto' | 'en' | 'es' | 'de' | 'fr' | 'pt';

export interface NotificationPrefs {
  blocks: boolean;
  workers: boolean;
  bestDiff: boolean;
}

interface SettingsState {
  // User preferences
  temperatureUnit: TemperatureUnit;
  pollingInterval: PollingInterval;
  workerSortOrder: WorkerSortOrder;
  minerSortBy: MinerSortOption;
  minerFilterBy: MinerFilterOption;
  language: Language;

  // User Bitcoin address (persisted)
  bitcoinAddress: string | null;

  // Push notifications
  notificationsEnabled: boolean;
  notificationPrefs: NotificationPrefs;
  pushToken: string | null;

  // Dismissed tips (persisted)
  dismissedTips: string[];

  // Worker notes (persisted) - keyed by worker name
  workerNotes: Record<string, string>;

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
  setLanguage: (lang: Language) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setNotificationPrefs: (prefs: Partial<NotificationPrefs>) => void;
  setPushToken: (token: string | null) => void;
  dismissTip: (tipId: string) => void;
  setWorkerNote: (workerName: string, note: string | null) => void;
  updateCacheTimestamp: (type: 'pool' | 'user') => void;
  setHydrated: (hydrated: boolean) => void;
}

const initialState: SettingsState = {
  temperatureUnit: 'celsius',
  pollingInterval: 10000,
  workerSortOrder: 'hashrate',
  minerSortBy: 'status',
  minerFilterBy: 'all',
  language: 'auto',
  bitcoinAddress: null,
  notificationsEnabled: false,
  notificationPrefs: { blocks: true, workers: true, bestDiff: true },
  pushToken: null,
  dismissedTips: [],
  workerNotes: {},
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

      setLanguage: (lang) => set({ language: lang }),

      setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),

      setNotificationPrefs: (prefs) =>
        set((state) => ({
          notificationPrefs: { ...state.notificationPrefs, ...prefs },
        })),

      setPushToken: (token) => set({ pushToken: token }),

      dismissTip: (tipId) =>
        set((state) => ({
          dismissedTips: state.dismissedTips.includes(tipId)
            ? state.dismissedTips
            : [...state.dismissedTips, tipId],
        })),

      setWorkerNote: (workerName, note) =>
        set((state) => {
          if (!note || note.trim() === '') {
            // Remove note if empty or null
            const { [workerName]: _, ...rest } = state.workerNotes;
            return { workerNotes: rest };
          }
          return {
            workerNotes: { ...state.workerNotes, [workerName]: note.trim() },
          };
        }),

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
        language: state.language,
        bitcoinAddress: state.bitcoinAddress,
        notificationsEnabled: state.notificationsEnabled,
        notificationPrefs: state.notificationPrefs,
        pushToken: state.pushToken,
        dismissedTips: state.dismissedTips,
        workerNotes: state.workerNotes,
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
export const selectLanguage = (state: SettingsState) => state.language;
export const selectNotificationsEnabled = (state: SettingsState) =>
  state.notificationsEnabled;
export const selectNotificationPrefs = (state: SettingsState) =>
  state.notificationPrefs;
export const selectPushToken = (state: SettingsState) => state.pushToken;
export const selectWorkerNotes = (state: SettingsState) => state.workerNotes;
