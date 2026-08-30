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
import { axeOS, hammer, avalon, avalonWeb, kbox, luxos, isSuccess } from '@/api';
import { scanSubnet } from '@/utils/discovery';
import { getKBoxApiKey, clearKBoxApiKey } from '@/utils/kboxAuth';
import { formatTemperature, parseDifficulty } from '@/utils/formatting';
import type { TemperatureUnit } from '@/utils/formatting';
import { getTempThresholdsFor } from '@/constants/theme';

/**
 * Check if a miner has any warnings (pure function for use in selectors)
 */
export const hasMinerWarnings = (miner: LocalMiner): boolean => {
  if (!miner.isOnline) return true;
  if (miner.temp >= getEffectiveTempThresholds(miner).caution) return true;
  if (miner.overheatMode || miner.powerFault) return true;
  // Skip the low-hashrate check in standby: the miner is intentionally
  // paused and `hashRate` is a decaying lifetime average, not a fault.
  // Also skipped during the startup ramp where hashrate legitimately
  // reads low/null while the ASICs spin up.
  if (isInStartupRamp(miner)) return false;
  if (!miner.isStandby && miner.hashRate < miner.expectedHashrate * 0.8)
    return true;
  return false;
};

/**
 * Suppress the low-hashrate warning while the miner ramps after boot:
 * KBox for ~30-60s per its API docs; LuxOS Antminers ramp for several
 * minutes (PowerTarget/Bist ramp modes) — 10 min is a doc-driven
 * window, refine when hardware feedback exists.
 */
const isInStartupRamp = (miner: LocalMiner): boolean =>
  (miner.minerType === 'kbox' && miner.uptimeSeconds < 120) ||
  (miner.minerType === 'luxos' && miner.uptimeSeconds < 600);

/**
 * Temperature thresholds for warnings. LuxOS miners report their own
 * tempctrl limits — prefer those (chip-die family when the model has
 * die sensors, board family otherwise) over the app constants, since
 * board thresholds (~65/70°C) and chip thresholds (~93/100°C) differ
 * wildly per model.
 */
function getEffectiveTempThresholds(miner: LocalMiner): {
  caution: number;
  danger: number;
} {
  if (miner.minerType === 'luxos') {
    const limits = miner.luxosTempLimits;
    const usingChipTemp = (miner.luxosChipTemps?.length ?? 0) > 0;
    const caution = usingChipTemp ? limits?.chipHot : limits?.hot;
    const danger = usingChipTemp ? limits?.chipDangerous : limits?.dangerous;
    if (typeof caution === 'number' && typeof danger === 'number') {
      return { caution, danger };
    }
  }
  return getTempThresholdsFor(miner.minerType);
}

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
  /** Start on-device autotune (Hammer v3 only; no-op otherwise). */
  autotuneMiner: (ip: string) => Promise<boolean>;
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

  // KBox-specific controls (no-op failure for non-KBox miners). All
  // return ApiResult so callers can branch on auth codes
  // ('unauthorized' / 'api_disabled') and open the key sheet.
  setKBoxLed: (ip: string, update: kbox.KBoxLedUpdate) => Promise<ApiResult<void>>;
  setKBoxFan: (ip: string, update: kbox.KBoxFanUpdate) => Promise<ApiResult<void>>;
  setKBoxPower: (
    ip: string,
    update: kbox.KBoxPowerUpdate
  ) => Promise<ApiResult<void>>;

  // LuxOS-specific controls (no-op failure for non-LuxOS miners). All
  // return ApiResult so callers can surface 'session_busy' distinctly.
  setLuxOSProfile: (ip: string, profileName: string) => Promise<ApiResult<void>>;
  /** Persistent locate toggle: red LED blink on / auto off */
  setLuxOSLocate: (ip: string, on: boolean) => Promise<ApiResult<void>>;
  addLuxOSPool: (
    ip: string,
    url: string,
    user: string,
    password?: string
  ) => Promise<ApiResult<void>>;
  removeLuxOSPool: (ip: string, poolId: number) => Promise<ApiResult<void>>;
  switchLuxOSPool: (ip: string, poolId: number) => Promise<ApiResult<void>>;

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
    // Legacy AxeOS-style Hammer firmware (2.x). v3 (`/v2/*`) is handled by
    // fetchHammer / the hammer client and tagged version 2.
    hammerApiVersion: minerType === 'hammer' ? 1 : undefined,
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
  if (preferredType === 'kbox') {
    return fetchKBox(ip);
  }
  if (preferredType === 'luxos') {
    return fetchLuxOS(ip);
  }
  if (preferredType === 'hammer') {
    // Known Hammer — resolve its firmware generation (v2 first) directly.
    return fetchHammer(ip);
  }

  const axeOsResult = await axeOS.getSystemInfo(ip);
  if (isSuccess(axeOsResult)) {
    return { success: true, data: parseSystemInfo(ip, axeOsResult.data) };
  }

  // Hammer v3 firmware only answers the `/v2/*` API — its legacy
  // /api/system/info is gone, so the AxeOS probe above missed it. One cheap
  // HTTP probe catches a manually-added v3 Hammer before the other protocols.
  if (await hammer.isHammerV2(ip)) {
    return fetchHammer(ip, 2);
  }

  // AxeOS failed — try KBox: also HTTP on port 80, but under /api/v1/,
  // and identifiable without an API key via its distinctive 401/403
  // JSON envelope. One cheap request; a real AxeOS never reaches here.
  if (await kbox.isKBox(ip)) {
    return fetchKBox(ip);
  }

  // LuxOS must be probed BEFORE the Avalon path: LuxOS also answers
  // cgminer-style TCP on 4028 (with no PROD field), so the Avalon
  // sequence below would half-parse a LuxOS miner into garbage. The
  // HTTP-8080 probe is unambiguous.
  if (await luxos.isLuxOS(ip)) {
    return fetchLuxOS(ip);
  }

  // Not KBox/LuxOS either — try Avalon. Cgminer is single-threaded; serialize.
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

/**
 * Fetch a KBox. Three outcomes:
 *  - key stored + accepted → full stats LocalMiner
 *  - device reachable but key missing/rejected or API disabled → a
 *    "locked" stub (isOnline: true, kboxAuthError set, zeroed stats).
 *    Locked ≠ offline — the existing offline machinery is untouched.
 *  - device unreachable → failure (caller marks it offline)
 *
 * A stored key is never auto-cleared on 401 — a transient firmware
 * state shouldn't nuke a good key. The user overwrites it via the
 * auth sheet (which verifies before persisting).
 */
async function fetchKBox(ip: string): Promise<ApiResult<LocalMiner>> {
  const key = await getKBoxApiKey(ip);

  if (!key) {
    // No key yet — confirm the device is actually there before showing
    // the locked state, so a powered-off KBox still reads as offline.
    const reachable = await kbox.isKBox(ip);
    if (!reachable) {
      return {
        success: false,
        error: { message: 'KBox unreachable', code: 'NETWORK_ERROR' },
      };
    }
    return {
      success: true,
      data: kbox.adaptToLocalMiner({ ip, authError: 'unauthorized' }),
    };
  }

  const status = await kbox.getStatus(ip, key);
  if (!isSuccess(status)) {
    const authError = kbox.authErrorFromCode(status.error.code);
    if (authError) {
      return {
        success: true,
        data: kbox.adaptToLocalMiner({ ip, authError }),
      };
    }
    return status;
  }

  // Defensive: HTTP status should mirror `ok`, but treat a 200 body
  // that still says ok:false + auth code as locked rather than crash
  // on missing fields.
  if (status.data.ok === false) {
    const authError = kbox.authErrorFromCode(status.data.error);
    return {
      success: true,
      data: kbox.adaptToLocalMiner({
        ip,
        authError: authError ?? 'unauthorized',
      }),
    };
  }

  // Best-effort per-board detail (frequency). A devices failure must
  // not fail the whole fetch — frequency just stays 0.
  const devices = await kbox.getDevices(ip, key);
  return {
    success: true,
    data: kbox.adaptToLocalMiner({
      ip,
      status: status.data,
      devices: isSuccess(devices) ? devices.data.devices : undefined,
    }),
  };
}

/**
 * Fetch a LuxOS miner: one multi-command HTTP round-trip for the whole
 * monitoring snapshot, normalized by the adapter.
 */
async function fetchLuxOS(ip: string): Promise<ApiResult<LocalMiner>> {
  const snapshot = await luxos.getSnapshot(ip);
  if (!isSuccess(snapshot)) return snapshot;
  return {
    success: true,
    data: luxos.adaptToLocalMiner({ ip, snapshot: snapshot.data }),
  };
}

/** Fetch a Hammer via the v3 `/v2/*` API (tagged hammerApiVersion: 2). */
async function fetchHammerV2(ip: string): Promise<ApiResult<LocalMiner>> {
  const snapshot = await hammer.getSnapshot(ip);
  if (!isSuccess(snapshot)) return snapshot;
  return {
    success: true,
    data: hammer.adaptToLocalMiner({ ip, snapshot: snapshot.data }),
  };
}

/** Fetch a Hammer via the legacy AxeOS-style API (tagged hammerApiVersion: 1). */
async function fetchHammerLegacy(ip: string): Promise<ApiResult<LocalMiner>> {
  const result = await axeOS.getSystemInfo(ip);
  if (!isSuccess(result)) return result;
  return { success: true, data: parseSystemInfo(ip, result.data) };
}

/**
 * Fetch a Hammer over whichever firmware generation responds. Tries the
 * preferred generation first (v2 by default), and on failure tries the other.
 * This makes a firmware upgrade/downgrade transparent: a miner saved as one
 * generation that has since switched won't go offline — it just re-resolves,
 * and the caller persists the new `hammerApiVersion`.
 */
async function fetchHammer(
  ip: string,
  preferred?: 1 | 2
): Promise<ApiResult<LocalMiner>> {
  const tryVersion = (v: 1 | 2) =>
    v === 2 ? fetchHammerV2(ip) : fetchHammerLegacy(ip);
  const first: 1 | 2 = preferred === 1 ? 1 : 2;
  const second: 1 | 2 = first === 2 ? 1 : 2;

  const firstResult = await tryVersion(first);
  if (isSuccess(firstResult)) return firstResult;

  const secondResult = await tryVersion(second);
  if (isSuccess(secondResult)) return secondResult;

  // Both generations failed — surface the preferred generation's error.
  return firstResult;
}

/** Guard for LuxOS writes: fail fast when the miner isn't a LuxOS */
function getLuxOSGuard(
  ip: string,
  get: () => MinerState & MinerActions
): ApiResult<void> | null {
  const miner = get().miners.find((m) => m.ip === ip);
  if (miner?.minerType !== 'luxos') {
    return {
      success: false,
      error: { message: 'Not a LuxOS miner', code: 'NOT_LUXOS' },
    };
  }
  return null;
}

/** Narrow zustand set() shape the KBox write helpers need */
type KBoxStoreSet = (
  partial:
    | Partial<MinerState>
    | ((state: MinerState & MinerActions) => Partial<MinerState>)
) => void;

/** Flag a miner as auth-locked so the list/detail UI shows the key prompt */
function markKBoxAuthError(
  ip: string,
  authError: 'unauthorized' | 'api_disabled',
  set: KBoxStoreSet
): void {
  set((state) => ({
    miners: state.miners.map((m) =>
      m.ip === ip ? { ...m, kboxAuthError: authError } : m
    ),
  }));
}

/**
 * Common preamble for KBox writes: confirm the miner is a KBox and load
 * its API key from secure storage. Returns the key on success.
 */
async function getKBoxWriteContext(
  ip: string,
  get: () => MinerState & MinerActions,
  set: KBoxStoreSet
): Promise<ApiResult<string>> {
  const miner = get().miners.find((m) => m.ip === ip);
  if (miner?.minerType !== 'kbox') {
    return {
      success: false,
      error: { message: 'Not a KBox miner', code: 'NOT_KBOX' },
    };
  }
  const key = await getKBoxApiKey(ip);
  if (!key) {
    markKBoxAuthError(ip, 'unauthorized', set);
    return {
      success: false,
      error: { message: 'KBox API key required', code: 'unauthorized' },
    };
  }
  return { success: true, data: key };
}

/**
 * Common postamble for KBox writes: convert transport failures and
 * ok:false envelopes into a failure ApiResult (flagging auth errors on
 * the miner), or return null when the write succeeded.
 */
function toKBoxWriteResult(
  ip: string,
  result: ApiResult<{ ok?: boolean; error?: string; message?: string }>,
  set: KBoxStoreSet
): ApiResult<void> | null {
  if (!isSuccess(result)) {
    const authError = kbox.authErrorFromCode(result.error.code);
    if (authError) markKBoxAuthError(ip, authError, set);
    set({ error: result.error });
    return { success: false, error: result.error };
  }
  if (result.data.ok === false) {
    const error: ApiError = {
      message: result.data.message ?? 'Request rejected',
      code: result.data.error,
    };
    const authError = kbox.authErrorFromCode(result.data.error);
    if (authError) markKBoxAuthError(ip, authError, set);
    set({ error });
    return { success: false, error };
  }
  return null;
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
              savedMiners: [
                ...state.savedMiners,
                {
                  ip,
                  minerType: miner.minerType,
                  hammerApiVersion: miner.hammerApiVersion,
                },
              ],
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
        const removed = get().miners.find((m) => m.ip === ip);
        set((state) => ({
          miners: state.miners.filter((m) => m.ip !== ip),
          savedMiners: state.savedMiners.filter((m) => m.ip !== ip),
        }));
        // Don't leave orphaned secrets behind (fire-and-forget)
        if (removed?.minerType === 'kbox') {
          void clearKBoxApiKey(ip);
        }
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

        try {
          // If we already know the miner's type, skip the protocol
          // fallback and go straight to its client. Saves an HTTP
          // timeout per poll cycle — and for KBox it's what routes the
          // fetch through the stored API key.
          const known = get().miners.find((m) => m.ip === ip);
          const result =
            known?.minerType === 'avalon'
              ? await fetchAvalon(ip)
              : known?.minerType === 'kbox'
                ? await fetchKBox(ip)
                : known?.minerType === 'luxos'
                  ? await fetchLuxOS(ip)
                  : known?.minerType === 'hammer'
                    ? await fetchHammer(ip, known.hammerApiVersion)
                    : await fetchMiner(ip);

          if (isSuccess(result)) {
            set((state) => {
              const existingMiner = state.miners.find((m) => m.ip === ip);
              const updatedMiner = existingMiner?.alias
                ? { ...result.data, alias: existingMiner.alias }
                : result.data;
              // Keep the persisted type in sync so rehydrated miners
              // take the right fast path next launch. Only touch
              // savedMiners when the type actually changed — mapping
              // unconditionally would trigger a persist write per poll.
              const savedEntry = state.savedMiners.find((m) => m.ip === ip);
              // Persist type and (for Hammer) firmware generation so a
              // rehydrated miner takes the right fast path next launch and a
              // firmware upgrade/downgrade sticks. Only write when something
              // actually changed — mapping unconditionally persists per poll.
              const dispatchChanged =
                savedEntry &&
                (savedEntry.minerType !== updatedMiner.minerType ||
                  savedEntry.hammerApiVersion !==
                    updatedMiner.hammerApiVersion);
              return {
                miners: state.miners.map((m) =>
                  m.ip === ip ? updatedMiner : m
                ),
                ...(dispatchChanged
                  ? {
                      savedMiners: state.savedMiners.map((m) =>
                        m.ip === ip
                          ? {
                              ...m,
                              minerType: updatedMiner.minerType,
                              hammerApiVersion: updatedMiner.hammerApiVersion,
                            }
                          : m
                      ),
                    }
                  : {}),
              };
            });
          } else {
            // Mark as offline but keep in list.
            set((state) => ({
              miners: state.miners.map((m) =>
                m.ip === ip ? { ...m, isOnline: false, lastSeen: Date.now() } : m
              ),
            }));
          }
        } catch (error) {
          // Protocol adapters should normally return ApiResult failures, but a
          // malformed firmware response must not leave a permanent spinner.
          console.warn(`[Miners] Unexpected refresh failure for ${ip}:`, error);
          set((state) => ({
            miners: state.miners.map((m) =>
              m.ip === ip ? { ...m, isOnline: false, lastSeen: Date.now() } : m
            ),
          }));
        } finally {
          set((state) => {
            const loadingMiners = new Set(state.loadingMiners);
            loadingMiners.delete(ip);
            return { loadingMiners };
          });
        }
      },

      refreshAllMiners: async () => {
        const { miners, refreshMiner } = get();
        await Promise.allSettled(miners.map((m) => refreshMiner(m.ip)));
      },

      restartMiner: async (ip) => {
        const miner = get().miners.find((m) => m.ip === ip);

        if (miner?.minerType === 'kbox') {
          const key = await getKBoxApiKey(ip);
          if (!key) {
            set({
              error: { message: 'KBox API key required', code: 'unauthorized' },
            });
            return false;
          }
          const result = await kbox.restart(ip, key);
          if (!isSuccess(result)) {
            // Surfaces the firmware's error code verbatim — notably
            // the once-per-90s restart debounce rejection.
            set({ error: result.error });
            return false;
          }
          // Defensive: 200 body that still says ok:false
          if (result.data.ok === false) {
            set({
              error: {
                message: result.data.message ?? 'Restart rejected',
                code: result.data.error,
              },
            });
            return false;
          }
          return true;
        }

        if (miner?.minerType === 'luxos') {
          // rebootdevice responds STATUS S *before* rebooting, so a
          // real response is expected here (no treat-timeout-as-
          // success). The device then drops off HTTP for minutes; the
          // offline/recovery machinery covers the gap. A failure may
          // carry code 'session_busy' — another tool holds the miner's
          // single config session.
          const result = await luxos.rebootDevice(ip);
          if (!isSuccess(result)) {
            set({ error: result.error });
          }
          return isSuccess(result);
        }

        const result =
          miner?.minerType === 'avalon'
            ? await avalon.reboot(ip)
            : miner?.minerType === 'hammer' && miner.hammerApiVersion === 2
              ? await hammer.reboot(ip)
              : await axeOS.restart(ip);
        if (!isSuccess(result)) {
          set({ error: result.error });
        }
        return isSuccess(result);
      },

      identifyMiner: async (ip) => {
        const miner = get().miners.find((m) => m.ip === ip);
        // Avalon Q firmware doesn't expose an LED-identify equivalent,
        // and the KBox API has no identify endpoint (we deliberately
        // don't emulate one with the ambient LEDs — save/restore of the
        // user's LED state is untestable without hardware). The
        // MinerControlsSection hides the button for both, so this path
        // is defensive — return false without setting an error.
        if (miner?.minerType === 'avalon' || miner?.minerType === 'kbox') {
          return false;
        }
        if (miner?.minerType === 'luxos') {
          // LuxOS ledset has no auto-revert: blink persists until
          // changed. Blink the red LED and restore 'auto' after 15s
          // fire-and-forget. Known limitation: killing the app inside
          // the window leaves the LED blinking (harmless; the settings
          // view exposes a persistent locate toggle to clear it).
          const result = await luxos.setLed(ip, 'red', 'blink');
          if (!isSuccess(result)) {
            set({ error: result.error });
            return false;
          }
          set((state) => ({
            miners: state.miners.map((m) =>
              m.ip === ip ? { ...m, luxosRedLed: 'blink' } : m
            ),
          }));
          setTimeout(() => {
            void luxos.setLed(ip, 'red', 'auto').then((revert) => {
              if (isSuccess(revert)) {
                set((state) => ({
                  miners: state.miners.map((m) =>
                    m.ip === ip ? { ...m, luxosRedLed: 'auto' } : m
                  ),
                }));
              }
            });
          }, 15000);
          return true;
        }
        if (miner?.minerType === 'hammer') {
          // v3 firmware can flash its RGB LED; legacy Hammer has no identify.
          if (miner.hammerApiVersion === 2) {
            const result = await hammer.identify(ip);
            if (!isSuccess(result)) {
              set({ error: result.error });
              return false;
            }
            return true;
          }
          return false;
        }
        const result = await axeOS.identify(ip);
        if (!isSuccess(result)) {
          set({ error: result.error });
        }
        return isSuccess(result);
      },

      autotuneMiner: async (ip) => {
        const miner = get().miners.find((m) => m.ip === ip);
        if (miner?.minerType !== 'hammer' || miner.hammerApiVersion !== 2) {
          return false;
        }
        const result = await hammer.autotune(ip);
        if (!isSuccess(result)) {
          set({ error: result.error });
          return false;
        }
        // Autotune walks freq/voltage over time; a refresh surfaces the change.
        void get().refreshMiner(ip);
        return true;
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

      setKBoxLed: async (ip, update) => {
        const guard = await getKBoxWriteContext(ip, get, set);
        if (!guard.success) return guard;
        const result = await kbox.setLed(ip, guard.data, update);
        const failure = toKBoxWriteResult(ip, result, set);
        if (failure) return failure;
        if (isSuccess(result)) {
          // Response echoes the resulting LED state (nested or flat)
          const echoed = result.data.led ?? result.data;
          set((state) => ({
            miners: state.miners.map((m) =>
              m.ip === ip
                ? {
                    ...m,
                    kboxLed: {
                      on: echoed.on ?? update.on ?? true,
                      effect:
                        typeof echoed.effect === 'string'
                          ? echoed.effect
                          : (update.effect ?? m.kboxLed?.effect),
                      color:
                        echoed.color &&
                        typeof echoed.color.r === 'number' &&
                        typeof echoed.color.g === 'number' &&
                        typeof echoed.color.b === 'number'
                          ? {
                              r: echoed.color.r,
                              g: echoed.color.g,
                              b: echoed.color.b,
                            }
                          : (update.color ?? m.kboxLed?.color),
                      speed:
                        typeof echoed.speed === 'number'
                          ? echoed.speed
                          : (update.speed ?? m.kboxLed?.speed),
                      brightness:
                        typeof echoed.brightness === 'number'
                          ? echoed.brightness
                          : (update.brightness ?? m.kboxLed?.brightness),
                    },
                  }
                : m
            ),
          }));
        }
        return { success: true, data: undefined };
      },

      setKBoxFan: async (ip, update) => {
        const guard = await getKBoxWriteContext(ip, get, set);
        if (!guard.success) return guard;
        const result = await kbox.setFan(ip, guard.data, update);
        const failure = toKBoxWriteResult(ip, result, set);
        if (failure) return failure;
        if (isSuccess(result) && typeof result.data.fan_percent === 'number') {
          const fanPercent = result.data.fan_percent;
          set((state) => ({
            miners: state.miners.map((m) =>
              m.ip === ip ? { ...m, fanSpeed: fanPercent } : m
            ),
          }));
        }
        return { success: true, data: undefined };
      },

      setKBoxPower: async (ip, update) => {
        const guard = await getKBoxWriteContext(ip, get, set);
        if (!guard.success) return guard;
        const result = await kbox.setPower(ip, guard.data, update);
        const failure = toKBoxWriteResult(ip, result, set);
        if (failure) return failure;
        if (isSuccess(result)) {
          // Prefer the mode the firmware says it applied; a custom
          // freq/corev write may not report a named mode.
          const applied =
            result.data.mode ?? ('mode' in update ? update.mode : 'Custom');
          set((state) => ({
            miners: state.miners.map((m) =>
              m.ip === ip
                ? {
                    ...m,
                    kboxPowerMode: applied,
                    ...(typeof result.data.freq === 'number'
                      ? { frequency: result.data.freq }
                      : 'freq' in update
                        ? { frequency: update.freq }
                        : {}),
                  }
                : m
            ),
          }));
        }
        return { success: true, data: undefined };
      },

      /**
       * Switch the active LuxOS power profile. Optimistic profile-name
       * update, then a refresh — expect the hashrate to dip while the
       * miner re-ramps onto the new profile.
       */
      setLuxOSProfile: async (ip, profileName) => {
        const guard = getLuxOSGuard(ip, get);
        if (guard) return guard;
        const result = await luxos.setProfile(ip, profileName);
        if (!isSuccess(result)) {
          set({ error: result.error });
          return result;
        }
        set((state) => ({
          miners: state.miners.map((m) =>
            m.ip === ip ? { ...m, luxosProfile: profileName } : m
          ),
        }));
        void get().refreshMiner(ip);
        return { success: true, data: undefined };
      },

      setLuxOSLocate: async (ip, on) => {
        const guard = getLuxOSGuard(ip, get);
        if (guard) return guard;
        const mode = on ? 'blink' : 'auto';
        const result = await luxos.setLed(ip, 'red', mode);
        if (!isSuccess(result)) {
          set({ error: result.error });
          return result;
        }
        set((state) => ({
          miners: state.miners.map((m) =>
            m.ip === ip ? { ...m, luxosRedLed: mode } : m
          ),
        }));
        return { success: true, data: undefined };
      },

      addLuxOSPool: async (ip, url, user, password) => {
        const guard = getLuxOSGuard(ip, get);
        if (guard) return guard;
        const result = await luxos.addPool(ip, url, user, password);
        if (!isSuccess(result)) {
          set({ error: result.error });
          return result;
        }
        void get().refreshMiner(ip);
        return { success: true, data: undefined };
      },

      removeLuxOSPool: async (ip, poolId) => {
        const guard = getLuxOSGuard(ip, get);
        if (guard) return guard;
        const result = await luxos.removePool(ip, poolId);
        if (!isSuccess(result)) {
          set({ error: result.error });
          return result;
        }
        void get().refreshMiner(ip);
        return { success: true, data: undefined };
      },

      switchLuxOSPool: async (ip, poolId) => {
        const guard = getLuxOSGuard(ip, get);
        if (guard) return guard;
        const result = await luxos.switchPool(ip, poolId);
        if (!isSuccess(result)) {
          set({ error: result.error });
          return result;
        }
        void get().refreshMiner(ip);
        return { success: true, data: undefined };
      },

      updateMinerSettings: async (ip, settings) => {
        const miner = get().miners.find((m) => m.ip === ip);

        // Hammer v3 (`/v2/*`): clean PUT of the merged config. Legacy Hammer:
        // full-payload PATCH with boot_mode. Everything else: AxeOS PATCH.
        const result =
          miner?.minerType === 'hammer' && miner.hammerApiVersion === 2
            ? await hammer.updateConfig(ip, settings)
            : miner?.minerType === 'hammer'
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
        const thresholds = getEffectiveTempThresholds(miner);
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
        // where hashRate is a decaying lifetime average of a paused
        // miner, nor during the startup ramp.
        if (
          !miner.isStandby &&
          !isInStartupRamp(miner) &&
          miner.hashRate < miner.expectedHashrate * 0.8
        ) {
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
            // Known type routes the first refresh down the right fast
            // path (critical for KBox, whose fetch needs the stored key)
            minerType: sm.minerType ?? ('unknown' as MinerType),
            hammerApiVersion: sm.hammerApiVersion,
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
  const highestDiff = miners.reduce(
    (highest, miner) => Math.max(highest, miner.bestDiff),
    0
  );

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
