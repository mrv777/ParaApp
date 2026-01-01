/**
 * Miner store for local Bitaxe miners
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  ApiError,
  LocalMiner,
  MinerWarning,
  MinerSettings,
  SavedMiner,
  BitaxeSystemInfo,
  DiscoveryProgress,
  DiscoveryOptions,
} from '@/types';
import { bitaxe, isSuccess } from '@/api';
import { scanSubnet } from '@/utils/discovery';
import { tempThresholds } from '@/constants/theme';

interface MinerState {
  // Runtime miner data
  miners: LocalMiner[];

  // Saved miners (persisted)
  savedMiners: SavedMiner[];

  // Discovery state
  isDiscovering: boolean;
  discoveryProgress: DiscoveryProgress | null;
  discoveredIps: string[];
  discoveryError: string | null;

  // Loading states
  isLoading: boolean;
  loadingMiners: Set<string>; // IPs currently being refreshed

  // Error state
  error: ApiError | null;
}

interface MinerActions {
  // Core actions
  addMiner: (ip: string) => Promise<boolean>;
  removeMiner: (ip: string) => void;
  updateMinerAlias: (ip: string, alias: string) => void;
  refreshMiner: (ip: string) => Promise<void>;
  refreshAllMiners: () => Promise<void>;

  // Miner controls
  restartMiner: (ip: string) => Promise<boolean>;
  identifyMiner: (ip: string) => Promise<boolean>;
  updateMinerSettings: (
    ip: string,
    settings: MinerSettings
  ) => Promise<boolean>;

  // Warning helpers
  getWarnings: (miner: LocalMiner) => MinerWarning[];

  // Discovery actions
  startDiscovery: (options?: DiscoveryOptions) => void;
  stopDiscovery: () => void;
  addDiscoveredIp: (ip: string) => void;
  clearDiscovery: () => void;

  // Error handling
  clearError: () => void;
}

const initialState: MinerState = {
  miners: [],
  savedMiners: [],
  isDiscovering: false,
  discoveryProgress: null,
  discoveredIps: [],
  discoveryError: null,
  isLoading: false,
  loadingMiners: new Set(),
  error: null,
};

// Module-level reference for discovery abort controller
let discoveryController: AbortController | null = null;

/**
 * Parse Bitaxe system info into LocalMiner format
 */
function parseSystemInfo(ip: string, info: BitaxeSystemInfo): LocalMiner {
  return {
    ip,
    hostname: info.hostname,
    ASICModel: info.ASICModel,
    deviceModel: getDeviceModel(info.ASICModel),
    expectedHashrate: getExpectedHashrate(info.ASICModel),
    hashRate: info.hashRate,
    power: info.power,
    temp: info.temp,
    voltage: info.coreVoltage,
    fanSpeed: info.fanspeed,
    bestDiff: parseFloat(info.bestDiff) || 0,
    sharesAccepted: info.sharesAccepted,
    sharesRejected: info.sharesRejected,
    stratumUser: info.stratumUser,
    stratumUrl: info.stratumURL,
    stratumPort: info.stratumPort,
    version: info.version,
    uptimeSeconds: info.uptimeSeconds,
    wifiSSID: info.ssid,
    overheatMode: info.overheat_mode === 1,
    lastSeen: Date.now(),
    isOnline: true,
  };
}

/**
 * Get device model name from ASIC model
 */
function getDeviceModel(asicModel: string): string {
  const models: Record<string, string> = {
    BM1366: 'Ultra',
    BM1368: 'Supra',
    BM1370: 'Gamma',
    BM1397: 'Max',
  };
  return models[asicModel] || 'Unknown';
}

/**
 * Get expected hashrate (GH/s) based on ASIC model
 */
function getExpectedHashrate(asicModel: string): number {
  const hashrates: Record<string, number> = {
    BM1366: 500,
    BM1368: 650,
    BM1370: 1200,
    BM1397: 400,
  };
  return hashrates[asicModel] || 500;
}

export const useMinerStore = create<MinerState & MinerActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      addMiner: async (ip) => {
        const { miners, savedMiners } = get();

        // Check if already added
        if (miners.some((m) => m.ip === ip)) {
          return true;
        }

        set({ isLoading: true, error: null });

        const result = await bitaxe.getSystemInfo(ip);

        if (isSuccess(result)) {
          const miner = parseSystemInfo(ip, result.data);

          set({
            miners: [...miners, miner],
            savedMiners: [...savedMiners, { ip }],
            isLoading: false,
          });

          return true;
        } else {
          set({ error: result.error, isLoading: false });
          return false;
        }
      },

      removeMiner: (ip) => {
        set((state) => ({
          miners: state.miners.filter((m) => m.ip !== ip),
          savedMiners: state.savedMiners.filter((m) => m.ip !== ip),
        }));
      },

      updateMinerAlias: (ip, alias) => {
        set((state) => ({
          miners: state.miners.map((m) =>
            m.ip === ip ? { ...m, alias } : m
          ),
          savedMiners: state.savedMiners.map((m) =>
            m.ip === ip ? { ...m, alias } : m
          ),
        }));
      },

      refreshMiner: async (ip) => {
        const { loadingMiners } = get();

        // Mark as loading
        const newLoadingMiners = new Set(loadingMiners);
        newLoadingMiners.add(ip);
        set({ loadingMiners: newLoadingMiners });

        const result = await bitaxe.getSystemInfo(ip);

        // Get fresh state after async operation to avoid race conditions
        const { loadingMiners: currentLoading, miners: currentMiners } = get();
        const updatedLoading = new Set(currentLoading);
        updatedLoading.delete(ip);

        if (isSuccess(result)) {
          const existingMiner = currentMiners.find((m) => m.ip === ip);
          const updatedMiner = parseSystemInfo(ip, result.data);

          // Preserve alias
          if (existingMiner?.alias) {
            updatedMiner.alias = existingMiner.alias;
          }

          set({
            miners: currentMiners.map((m) => (m.ip === ip ? updatedMiner : m)),
            loadingMiners: updatedLoading,
          });
        } else {
          // Mark as offline but keep in list
          set({
            miners: currentMiners.map((m) =>
              m.ip === ip ? { ...m, isOnline: false, lastSeen: Date.now() } : m
            ),
            loadingMiners: updatedLoading,
          });
        }
      },

      refreshAllMiners: async () => {
        const { miners, refreshMiner } = get();
        await Promise.all(miners.map((m) => refreshMiner(m.ip)));
      },

      restartMiner: async (ip) => {
        const result = await bitaxe.restart(ip);
        if (!isSuccess(result)) {
          set({ error: result.error });
        }
        return isSuccess(result);
      },

      identifyMiner: async (ip) => {
        const result = await bitaxe.identify(ip);
        if (!isSuccess(result)) {
          set({ error: result.error });
        }
        return isSuccess(result);
      },

      updateMinerSettings: async (ip, settings) => {
        const result = await bitaxe.updateSettings(ip, settings);
        if (isSuccess(result)) {
          // Refresh to get updated values
          get().refreshMiner(ip);
          return true;
        } else {
          set({ error: result.error });
          return false;
        }
      },

      getWarnings: (miner) => {
        const warnings: MinerWarning[] = [];

        // Offline check
        if (!miner.isOnline) {
          warnings.push({
            type: 'offline',
            severity: 'danger',
            message: 'Miner is offline',
          });
          return warnings; // No other checks needed
        }

        // Temperature checks
        if (miner.temp >= tempThresholds.danger) {
          warnings.push({
            type: 'temp_danger',
            severity: 'danger',
            message: `Temperature critical: ${Math.round(miner.temp)}°C`,
          });
        } else if (miner.temp >= tempThresholds.caution) {
          warnings.push({
            type: 'temp_caution',
            severity: 'caution',
            message: `Temperature warning: ${Math.round(miner.temp)}°C`,
          });
        }

        // Overheat mode
        if (miner.overheatMode) {
          warnings.push({
            type: 'overheat',
            severity: 'danger',
            message: 'Overheat protection active',
          });
        }

        // Power fault
        if (miner.powerFault) {
          warnings.push({
            type: 'power_fault',
            severity: 'danger',
            message: 'Power fault detected',
          });
        }

        // Low hashrate (below 80% of expected)
        if (miner.hashRate < miner.expectedHashrate * 0.8) {
          warnings.push({
            type: 'low_hashrate',
            severity: 'caution',
            message: 'Hashrate below expected',
          });
        }

        return warnings;
      },

      // Discovery actions
      startDiscovery: (options) => {
        // Stop any existing discovery
        if (discoveryController) {
          discoveryController.abort();
        }

        // Reset discovery state
        set({
          isDiscovering: true,
          discoveryProgress: { scanned: 0, total: 254, found: 0 },
          discoveredIps: [],
          discoveryError: null,
        });

        const { addMiner } = get();

        // Start the subnet scan
        discoveryController = scanSubnet(
          {
            onProgress: (progress) => {
              set({ discoveryProgress: progress });
            },
            onFound: async (ip) => {
              // Add to discovered list immediately for UI
              set((state) => ({
                discoveredIps: [...state.discoveredIps, ip],
              }));
              // Auto-save the miner
              await addMiner(ip);
            },
            onComplete: () => {
              set({ isDiscovering: false });
              discoveryController = null;
            },
            onError: (error) => {
              set({ isDiscovering: false, discoveryError: error });
              discoveryController = null;
            },
          },
          options
        );
      },

      stopDiscovery: () => {
        if (discoveryController) {
          discoveryController.abort();
          discoveryController = null;
        }
        set({ isDiscovering: false });
      },

      addDiscoveredIp: (ip) => {
        set((state) => ({
          discoveredIps: [...state.discoveredIps, ip],
        }));
      },

      clearDiscovery: () => {
        set({
          discoveredIps: [],
          discoveryProgress: null,
          discoveryError: null,
        });
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'parasite-miners',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        savedMiners: state.savedMiners,
      }),
      onRehydrateStorage: () => (state) => {
        // On rehydrate, refresh all saved miners
        if (state?.savedMiners && state.savedMiners.length > 0) {
          // Initialize miners as offline, will be refreshed
          const offlineMiners: LocalMiner[] = state.savedMiners.map((sm) => ({
            ip: sm.ip,
            alias: sm.alias,
            hostname: '',
            ASICModel: '',
            deviceModel: 'Unknown',
            expectedHashrate: 0,
            hashRate: 0,
            power: 0,
            temp: 0,
            voltage: 0,
            fanSpeed: 0,
            bestDiff: sm.lastBestDiff || 0,
            sharesAccepted: 0,
            sharesRejected: 0,
            stratumUser: '',
            stratumUrl: '',
            stratumPort: 0,
            version: '',
            uptimeSeconds: 0,
            lastSeen: 0,
            isOnline: false,
          }));

          state.miners = offlineMiners;
          // Refresh will be triggered by the app on mount
        }
      },
    }
  )
);

// Selectors
export const selectMiners = (state: MinerState) => state.miners;
export const selectSavedMiners = (state: MinerState) => state.savedMiners;
export const selectOnlineMiners = (state: MinerState) =>
  state.miners.filter((m) => m.isOnline);
export const selectOfflineMiners = (state: MinerState) =>
  state.miners.filter((m) => !m.isOnline);
export const selectMinersWithWarnings = (state: MinerState) =>
  state.miners.filter((m) => {
    const store = useMinerStore.getState();
    return store.getWarnings(m).length > 0;
  });
export const selectIsDiscovering = (state: MinerState) => state.isDiscovering;
export const selectDiscoveryProgress = (state: MinerState) =>
  state.discoveryProgress;
export const selectDiscoveryError = (state: MinerState) => state.discoveryError;
export const selectDiscoveredIps = (state: MinerState) => state.discoveredIps;
export const selectMinerError = (state: MinerState) => state.error;
export const selectIsLoading = (state: MinerState) => state.isLoading;
export const selectIsMinerLoading = (state: MinerState, ip: string) =>
  state.loadingMiners.has(ip);
