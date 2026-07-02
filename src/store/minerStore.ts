/**
 * Miner store for local AxeOS miners
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  ApiError,
  ApiResult,
  AvalonWorkMode,
  LocalMiner,
  MinerWarning,
  MinerSettings,
  MinerType,
  SavedMiner,
  AxeOSSystemInfo,
  DiscoveryProgress,
  DiscoveryOptions,
} from '@/types';
import { axeOS, avalon, avalonWeb, isSuccess } from '@/api';
import { scanSubnet } from '@/utils/discovery';
import { formatTemperature, parseDifficulty } from '@/utils/formatting';
import type { TemperatureUnit } from '@/utils/formatting';
import { getTempThresholdsFor } from '@/constants/theme';

/**
 * Check if a miner has any warnings (pure function for use in selectors)
 */
export const hasMinerWarnings = (miner: LocalMiner): boolean => {
  if (!miner.isOnline) return true;
  if (miner.temp >= getTempThresholdsFor(miner.minerType).caution) return true;
  if (miner.overheatMode || miner.powerFault) return true;
  // Skip the low-hashrate check in standby: the miner is intentionally
  // paused and `hashRate` is a decaying lifetime average, not a fault.
  if (!miner.isStandby && miner.hashRate < miner.expectedHashrate * 0.8)
    return true;
  return false;
};

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
  addMiner: (ip: string, minerType?: MinerType) => Promise<boolean>;
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

  // Avalon-specific controls (no-op for non-Avalon miners)
  setAvalonWorkMode: (ip: string, mode: AvalonWorkMode) => Promise<boolean>;
  /**
   * Returns ApiResult so the caller can distinguish auth failure
   * (`error.code === 'AUTH_FAILED'`) from network/CGI errors and
   * react accordingly — typically clearing the saved password and
   * re-prompting on AUTH_FAILED.
   */
  setAvalonPools: (
    ip: string,
    adminPassword: string,
    slots: [
      avalonWeb.PoolSlot,
      avalonWeb.PoolSlot?,
      avalonWeb.PoolSlot?,
    ]
  ) => Promise<ApiResult<void>>;

  // Warning helpers
  getWarnings: (miner: LocalMiner, temperatureUnit?: TemperatureUnit) => MinerWarning[];

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
 * Detect miner firmware type from system info response
 */
function detectMinerType(info: AxeOSSystemInfo): MinerType {
  // Hammer uses uppercase DeviceModel and has sn_str
  if (info.DeviceModel || info.sn_str !== undefined) return 'hammer';
  // AxeOS uses lowercase deviceModel or has vrTemp
  if (info.deviceModel || info.vrTemp !== undefined) return 'axeos';
  return 'unknown';
}

/**
 * Map raw Hammer device model codes to display names
 */
function getHammerModelDisplay(rawModel: string): string {
  const displayNames: Record<string, string> = {
    BC04: 'Hammer BC04',
  };
  return displayNames[rawModel] || rawModel;
}

/**
 * Parse system info into LocalMiner format (supports AxeOS and Hammer)
 */
function parseSystemInfo(ip: string, info: AxeOSSystemInfo): LocalMiner {
  const minerType = detectMinerType(info);

  // Normalize device model: AxeOS uses lowercase, Hammer uses uppercase
  const deviceModel =
    info.deviceModel ||
    (info.DeviceModel ? getHammerModelDisplay(info.DeviceModel) : null) ||
    getDeviceModel(info.ASICModel);

  return {
    ip,
    hostname: info.hostname,
    ASICModel: info.ASICModel,
    deviceModel,
    minerType,
    expectedHashrate: getExpectedHashrate(info.ASICModel) * (info.asicCount || 1),
    hashRate: info.hashRate,
    power: info.power,
    temp: info.temp,
    voltage: info.coreVoltage,
    frequency: info.frequency,
    fanSpeed: info.fanspeed,
    autoFanSpeed: info.autofanspeed ?? 0,
    targetTemp: info.temptarget,
    fanRpm: info.fanrpm,
    bestDiff: parseDifficulty(info.bestDiff),
    bestSessionDiff: parseDifficulty(info.bestSessionDiff),
    sharesAccepted: info.sharesAccepted,
    sharesRejected: info.sharesRejected,
    stratumUser: info.stratumUser,
    stratumUrl: info.stratumURL,
    stratumPort: info.stratumPort,
    version: info.version,
    uptimeSeconds: info.uptimeSeconds,
    wifiSSID: info.ssid,
    rssi: info.wifiRSSI,
    overheatMode: info.overheat_mode === 1,
    lastSeen: Date.now(),
    isOnline: true,
    // Hammer-specific
    hwErrors: info.hwNumber,
    hwErrorRate: info.hwRate,
    fallbackStratumUrl: info.fallbackStratumURL,
    fallbackStratumPort: info.fallbackStratumPort,
    fallbackStratumUser: info.fallbackStratumUser,
    isUsingFallbackStratum: (info.isUsingFallbackStratum ?? 0) > 0,
    serialNumber: info.sn_str,
    bootMode: info.boot_mode,
    rawConfig: minerType === 'hammer' ? {
      flipscreen: info.flipscreen,
      invertfanpolarity: info.invertfanpolarity,
      overheat_mode: info.overheat_mode,
      ntpServer: info.ntpServer || 'pool.ntp.org',
      ntpServerBackup: info.ntpServerBackup || 'ntp.aliyun.com',
    } : undefined,
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

/**
 * Fetch a miner over whichever protocol responds. Tries AxeOS HTTP
 * first (cheap), falls back to Avalon's CGMiner JSON RPC. Returns the
 * first successful result, or the AxeOS error if both fail.
 *
 * On the Avalon path the LocalMiner is composed from version + summary
 * + pools + stats — three TCP round-trips. We don't fetch `estats`
 * here; the per-ASIC heatmap lives behind a "show details" toggle on
 * the detail screen and pulls estats on demand.
 */
async function fetchMiner(
  ip: string,
  preferredType?: MinerType
): Promise<ApiResult<LocalMiner>> {
  if (preferredType === 'avalon') {
    return fetchAvalon(ip);
  }

  const axeOsResult = await axeOS.getSystemInfo(ip);
  if (isSuccess(axeOsResult)) {
    return { success: true, data: parseSystemInfo(ip, axeOsResult.data) };
  }

  // AxeOS failed — try Avalon. Cgminer is single-threaded; serialize.
  const version = await avalon.getVersion(ip);
  if (!isSuccess(version)) {
    // Surface the original AxeOS error since that was the primary
    // protocol attempt. The Avalon failure is usually identical
    // (network unreachable) and not actionable separately.
    return axeOsResult;
  }
  const summary = await avalon.getSummary(ip);
  if (!isSuccess(summary)) return summary;
  const pools = await avalon.getPools(ip);
  if (!isSuccess(pools)) return pools;
  const stats = await fetchAvalonStats(ip);
  if (!isSuccess(stats)) return stats;

  return {
    success: true,
    data: avalon.adaptToLocalMiner({
      ip,
      version: version.data,
      summary: summary.data,
      pools: pools.data,
      stats: stats.data,
    }),
  };
}

/**
 * Fast path for already-known Avalons: skip the AxeOS HTTP probe (and
 * its 5s timeout) and go straight to cgminer. Use from refreshMiner
 * when we already know the miner's type.
 */
async function fetchAvalon(ip: string): Promise<ApiResult<LocalMiner>> {
  const version = await avalon.getVersion(ip);
  if (!isSuccess(version)) return version;
  const summary = await avalon.getSummary(ip);
  if (!isSuccess(summary)) return summary;
  const pools = await avalon.getPools(ip);
  if (!isSuccess(pools)) return pools;
  const stats = await fetchAvalonStats(ip);
  if (!isSuccess(stats)) return stats;
  return {
    success: true,
    data: avalon.adaptToLocalMiner({
      ip,
      version: version.data,
      summary: summary.data,
      pools: pools.data,
      stats: stats.data,
    }),
  };
}

/**
 * Fetch MM stats with an automatic fallback to `estats` when `stats`
 * returns an empty MM blob. Avalon Q (MM319) intermittently replies
 * to `stats` with an empty `MM ID0:Summary` value while `estats`
 * still returns the full blob — observed reproducibly post-reboot
 * after a workmode change. Falling back keeps the detail screen
 * populated at the cost of a single extra ~2 KB read.
 */
async function fetchAvalonStats(ip: string) {
  const stats = await avalon.getStats(ip);
  if (!isSuccess(stats)) return stats;
  if (Object.keys(stats.data.mm).length === 0) {
    const estats = await avalon.getEStats(ip);
    if (isSuccess(estats) && Object.keys(estats.data.mm).length > 0) {
      return estats;
    }
  }
  return stats;
}

export const useMinerStore = create<MinerState & MinerActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      addMiner: async (ip, minerType) => {
        // Initial duplicate check
        if (get().miners.some((m) => m.ip === ip)) {
          return true;
        }

        set({ isLoading: true, error: null });

        const result = await fetchMiner(ip, minerType);

        if (isSuccess(result)) {
          const miner = result.data;

          // Use functional set() with fresh state to avoid race conditions
          // when multiple miners are discovered simultaneously
          set((state) => {
            // Re-check for duplicates with fresh state
            if (state.miners.some((m) => m.ip === ip)) {
              return { isLoading: false };
            }
            return {
              miners: [...state.miners, miner],
              savedMiners: [...state.savedMiners, { ip }],
              isLoading: false,
            };
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
        // Mark as loading BEFORE the network round-trip so list rows
        // can show a spinner during the slow part. Use functional
        // set() to avoid clobbering concurrent refreshes of other IPs.
        set((state) => {
          const next = new Set(state.loadingMiners);
          next.add(ip);
          return { loadingMiners: next };
        });

        // If we already know this is an Avalon, skip the AxeOS probe
        // and go straight to cgminer. Saves one HTTP timeout on every
        // poll cycle.
        const known = get().miners.find((m) => m.ip === ip);
        const result =
          known?.minerType === 'avalon'
            ? await fetchAvalon(ip)
            : await fetchMiner(ip);

        // Get fresh state after async operation to avoid race conditions
        const { loadingMiners: currentLoading, miners: currentMiners } = get();
        const updatedLoading = new Set(currentLoading);
        updatedLoading.delete(ip);

        if (isSuccess(result)) {
          const existingMiner = currentMiners.find((m) => m.ip === ip);
          const updatedMiner = result.data;

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
        const miner = get().miners.find((m) => m.ip === ip);
        const result =
          miner?.minerType === 'avalon'
            ? await avalon.reboot(ip)
            : await axeOS.restart(ip);
        if (!isSuccess(result)) {
          set({ error: result.error });
        }
        return isSuccess(result);
      },

      identifyMiner: async (ip) => {
        const miner = get().miners.find((m) => m.ip === ip);
        // Avalon Q firmware doesn't expose an LED-identify equivalent.
        // The MinerControlsSection hides the button for Avalon, so this
        // path is defensive — return false without setting an error.
        if (miner?.minerType === 'avalon') {
          return false;
        }
        const result = await axeOS.identify(ip);
        if (!isSuccess(result)) {
          set({ error: result.error });
        }
        return isSuccess(result);
      },

      /**
       * Set Avalon work mode. Per Canaan's KB the new mode does not
       * take effect until reboot, so callers should follow up with
       * `restartMiner(ip)` and surface the recovery time (~3-4 min).
       */
      setAvalonWorkMode: async (
        ip: string,
        mode: AvalonWorkMode
      ): Promise<boolean> => {
        const miner = get().miners.find((m) => m.ip === ip);
        if (miner?.minerType !== 'avalon') return false;
        const result = await avalon.setWorkMode(ip, mode);
        if (!isSuccess(result)) {
          set({ error: result.error });
          return false;
        }
        // Optimistic local update — UI reflects intent immediately.
        // Real read happens after the post-set reboot completes.
        set((state) => ({
          miners: state.miners.map((m) =>
            m.ip === ip ? { ...m, workMode: mode } : m
          ),
        }));
        return true;
      },

      /**
       * Update Avalon pool slots via the web CGI. Requires the device
       * admin password (cgminer's setpool isn't supported on Q firmware).
       * The miner needs a reboot for new pool config to take effect.
       *
       * Returns the underlying ApiResult so callers can branch on
       * `error.code === 'AUTH_FAILED'` and clear/reprompt the password.
       */
      setAvalonPools: async (
        ip: string,
        adminPassword: string,
        slots: [
          avalonWeb.PoolSlot,
          avalonWeb.PoolSlot?,
          avalonWeb.PoolSlot?,
        ]
      ): Promise<ApiResult<void>> => {
        const session = await avalonWeb.login(ip, adminPassword);
        if (!isSuccess(session)) {
          set({ error: session.error });
          return session;
        }
        const result = await avalonWeb.setPools(ip, session.data, slots);
        if (!isSuccess(result)) {
          set({ error: result.error });
        }
        return result;
      },

      updateMinerSettings: async (ip, settings) => {
        const miner = get().miners.find((m) => m.ip === ip);

        // Hammer requires full payload with boot_mode
        const result = miner?.minerType === 'hammer'
          ? await axeOS.updateHammerSettings(ip, settings, miner)
          : await axeOS.updateSettings(ip, settings);

        if (isSuccess(result)) {
          // Refresh to get updated values
          get().refreshMiner(ip);
          return true;
        } else {
          set({ error: result.error });
          return false;
        }
      },

      getWarnings: (miner, temperatureUnit = 'celsius') => {
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

        // Temperature checks — thresholds are stored in °C but messages use display unit
        const thresholds = getTempThresholdsFor(miner.minerType);
        if (miner.temp >= thresholds.danger) {
          warnings.push({
            type: 'temp_danger',
            severity: 'danger',
            message: `Temperature critical: ${formatTemperature(miner.temp, temperatureUnit)}`,
          });
        } else if (miner.temp >= thresholds.caution) {
          warnings.push({
            type: 'temp_caution',
            severity: 'caution',
            message: `Temperature warning: ${formatTemperature(miner.temp, temperatureUnit)}`,
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

        // Low hashrate (below 80% of expected) — not a fault in standby,
        // where hashRate is a decaying lifetime average of a paused miner.
        if (!miner.isStandby && miner.hashRate < miner.expectedHashrate * 0.8) {
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
            onFound: async (ip, minerType) => {
              // Add to discovered list immediately for UI
              set((state) => ({
                discoveredIps: [...state.discoveredIps, ip],
              }));
              // Auto-save the miner
              await addMiner(ip, minerType);
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
            minerType: 'unknown' as MinerType,
            expectedHashrate: 0,
            hashRate: 0,
            power: 0,
            temp: 0,
            voltage: 0,
            frequency: 0,
            fanSpeed: 0,
            autoFanSpeed: 0,
            fanRpm: 0,
            bestDiff: sm.lastBestDiff || 0,
            bestSessionDiff: 0,
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

// Stable empty array for selectors (prevents infinite re-renders)
const EMPTY_MINERS: LocalMiner[] = [];

// Selectors
export const selectMiners = (state: MinerState) => state.miners;
export const selectSavedMiners = (state: MinerState) => state.savedMiners;
export const selectOnlineMiners = (state: MinerState) =>
  state.miners.filter((m) => m.isOnline);
export const selectOfflineMiners = (state: MinerState) =>
  state.miners.filter((m) => !m.isOnline);
export const selectMinersWithWarnings = (state: MinerState) =>
  state.miners.filter(hasMinerWarnings);
export const selectIsDiscovering = (state: MinerState) => state.isDiscovering;
export const selectDiscoveryProgress = (state: MinerState) =>
  state.discoveryProgress;
export const selectDiscoveryError = (state: MinerState) => state.discoveryError;
export const selectDiscoveredIps = (state: MinerState) => state.discoveredIps;
export const selectMinerError = (state: MinerState) => state.error;
export const selectIsLoading = (state: MinerState) => state.isLoading;
export const selectIsMinerLoading = (state: MinerState, ip: string) =>
  state.loadingMiners.has(ip);

/**
 * Select all miners that match a given stratumUser
 * Returns a stable empty array if no matches to prevent re-renders
 */
export const selectMinersByStratumUser =
  (stratumUser: string) =>
  (state: MinerState): LocalMiner[] => {
    if (!stratumUser) return EMPTY_MINERS;
    const matches = state.miners.filter((m) => m.stratumUser === stratumUser);
    return matches.length > 0 ? matches : EMPTY_MINERS;
  };

/**
 * Fleet stats for Home screen overview
 */
export interface FleetStats {
  totalHashrate: number; // Sum of online miner hashrates (GH/s)
  highestDiff: number; // Max bestDiff across all miners
  warningCount: number; // Total miners with warnings
  onlineCount: number; // Number of online miners
  totalCount: number; // Total miners saved
}

/**
 * Select aggregated fleet stats for Home screen
 * Returns null if no miners saved
 */
export const selectFleetStats = (state: MinerState): FleetStats | null => {
  const { miners } = state;
  if (miners.length === 0) return null;

  const onlineMiners = miners.filter((m) => m.isOnline);
  const totalHashrate = onlineMiners.reduce((sum, m) => sum + m.hashRate, 0);
  const highestDiff = Math.max(0, ...miners.map((m) => m.bestDiff));

  // Count miners with warnings
  const warningCount = miners.filter(hasMinerWarnings).length;

  return {
    totalHashrate,
    highestDiff,
    warningCount,
    onlineCount: onlineMiners.length,
    totalCount: miners.length,
  };
};
