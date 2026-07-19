/**
 * Settings store with AsyncStorage persistence
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TemperatureUnit } from '@/utils/formatting';
import { normalizeBitcoinAddress } from '@/utils/bitcoinAddress';
import type { MinerSortOption, MinerFilterOption, MinerViewMode } from '@/types';

export type PollingInterval = 5000 | 10000 | 20000 | 30000;
export type WorkerSortOrder = 'hashrate' | 'name' | 'bestDiff';
export type Language = 'auto' | 'en' | 'es' | 'de' | 'fr' | 'pt';
export type RoundMode = 'round' | 'alltime';

export interface NotificationPrefs {
  blocks: boolean;
  workers: boolean;
  bestDiff: boolean;
  rewards: boolean;
}

interface SettingsState {
  // User preferences
  temperatureUnit: TemperatureUnit;
  pollingInterval: PollingInterval;
  workerSortOrder: WorkerSortOrder;
  minerSortBy: MinerSortOption;
  minerFilterBy: MinerFilterOption;
  minerViewMode: MinerViewMode;
  language: Language;

  // User Bitcoin address (persisted)
  bitcoinAddress: string | null;

  // Push notifications
  notificationsEnabled: boolean;
  notificationPrefs: NotificationPrefs;
  pushToken: string | null;

  // iOS widget background/silent refresh opt-in
  widgetUpdatesEnabled: boolean;

  // Leaderboard / rank display mode
  roundMode: RoundMode;

  // Accepted chat EULA/community-guidelines version (persisted; null = not accepted)
  chatEulaVersion: string | null;

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
  setMinerViewMode: (mode: MinerViewMode) => void;
  setBitcoinAddress: (address: string | null) => void;
  setRoundMode: (mode: RoundMode) => void;
  setLanguage: (lang: Language) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setNotificationPrefs: (prefs: Partial<NotificationPrefs>) => void;
  setPushToken: (token: string | null) => void;
  setWidgetUpdatesEnabled: (enabled: boolean) => void;
  setChatEulaVersion: (version: string) => void;
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
  minerViewMode: 'list',
  roundMode: 'round',
  language: 'auto',
  bitcoinAddress: null,
  notificationsEnabled: false,
  notificationPrefs: { blocks: true, workers: true, bestDiff: true, rewards: true },
  pushToken: null,
  widgetUpdatesEnabled: true,
  chatEulaVersion: null,
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

      setMinerViewMode: (mode) => set({ minerViewMode: mode }),

      setBitcoinAddress: (address) =>
        set({ bitcoinAddress: address ? normalizeBitcoinAddress(address) : null }),

      setRoundMode: (mode) => set({ roundMode: mode }),

      setLanguage: (lang) => set({ language: lang }),

      setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),

      setNotificationPrefs: (prefs) =>
        set((state) => {
          const next = { ...state.notificationPrefs, ...prefs };
          if (
            next.blocks === state.notificationPrefs.blocks &&
            next.workers === state.notificationPrefs.workers &&
            next.bestDiff === state.notificationPrefs.bestDiff &&
            next.rewards === state.notificationPrefs.rewards
          ) {
            return state;
          }
          return { notificationPrefs: next };
        }),

      setPushToken: (token) => set({ pushToken: token }),

      setWidgetUpdatesEnabled: (enabled) =>
        set({ widgetUpdatesEnabled: enabled }),

      setChatEulaVersion: (version) => set({ chatEulaVersion: version }),

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
        minerViewMode: state.minerViewMode,
        roundMode: state.roundMode,
        language: state.language,
        bitcoinAddress: state.bitcoinAddress,
        notificationsEnabled: state.notificationsEnabled,
        notificationPrefs: state.notificationPrefs,
        pushToken: state.pushToken,
        widgetUpdatesEnabled: state.widgetUpdatesEnabled,
        chatEulaVersion: state.chatEulaVersion,
        dismissedTips: state.dismissedTips,
        workerNotes: state.workerNotes,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
      // v1: widget background refresh became opt-out (default on).
      // v2: canonicalize persisted uppercase Bech32/Bech32m addresses.
      // v3: notificationPrefs gained `rewards` (default on); the nested object
      //     is persisted whole, so older snapshots lack the key.
      version: 3,
      migrate: (persistedState, version) => {
        let state = (persistedState ?? {}) as Partial<SettingsState>;
        if (version < 1) {
          state = { ...state, widgetUpdatesEnabled: true };
        }
        if (version < 2 && state.bitcoinAddress) {
          state = {
            ...state,
            bitcoinAddress: normalizeBitcoinAddress(state.bitcoinAddress),
          };
        }
        if (version < 3) {
          state = {
            ...state,
            notificationPrefs: {
              blocks: true,
              workers: true,
              bestDiff: true,
              ...(state.notificationPrefs ?? {}),
              rewards: true,
            },
          };
        }
        return state;
      },
    }
  )
);

/**
 * Resolves once the persisted settings have rehydrated from AsyncStorage.
 * Used by background/headless paths (e.g. widget refresh) that read settings
 * outside the React tree and would otherwise see the initial (null) state.
 */
export function awaitSettingsHydration(timeoutMs = 5000): Promise<void> {
  if (useSettingsStore.persist.hasHydrated()) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      unsub();
      clearTimeout(timer);
      resolve();
    };
    // Safety net: never let a headless task hang on a stuck storage read.
    const timer = setTimeout(finish, timeoutMs);
    const unsub = useSettingsStore.persist.onFinishHydration(finish);
  });
}

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
export const selectWidgetUpdatesEnabled = (state: SettingsState) =>
  state.widgetUpdatesEnabled;
export const selectRoundMode = (state: SettingsState) => state.roundMode;
export const selectChatEulaVersion = (state: SettingsState) =>
  state.chatEulaVersion;
export const selectMinerViewMode = (state: SettingsState) =>
  state.minerViewMode;
export const selectWorkerNotes = (state: SettingsState) => state.workerNotes;
