/**
 * LuxOS (Luxor firmware for Antminers) local API client.
 *
 * LUXminer exposes a cgminer-style RPC surface on TCP 4028 and an
 * identical HTTP wrapper on port 8080: POST http://{ip}:8080/api with
 * body {"command":"<name>","parameter":"a,b,c"}. We use the HTTP layer
 * (the built-in web UI depends on it, so it's effectively always on).
 *
 * Reads need no auth. luxminer-namespace writes (rebootdevice, ledset,
 * profileset, …) need a session: `logon` → SessionID passed as the
 * first comma-joined parameter; expires after 60s idle; at most one
 * session exists at a time. Pool commands (addpool/removepool/
 * switchpool) are cgminer-namespace and take NO session.
 *
 * NOTE: written doc-driven without hardware (docs.luxor.tech/firmware).
 * Every wire field is optional and parsing is null-tolerant; the
 * multi-command response shape is the top inference to validate on
 * real hardware (see unwrap()).
 */

import type { ApiResult, LocalMiner, LuxOSProfile, LuxOSTempLimits } from '@/types';
import {
  MAX_REMOTE_ITEMS,
  boundedRemoteItems,
  finiteNumberRange,
} from '@/utils/finiteNumbers';
import { postJson, MINER_TIMEOUT } from './client';

/** Probe timeout for discovery (ms) — matches discovery.ts fast-fail */
const PROBE_TIMEOUT = 5000;

/** LuxOS HTTP API port (TCP API on 4028 is not used by the app) */
export const LUXOS_HTTP_PORT = 8080;

const apiUrl = (ip: string) => `http://${ip}:${LUXOS_HTTP_PORT}/api`;

// ---------------------------------------------------------------------------
// Wire types — every field optional (doc-driven, null-tolerant)
// ---------------------------------------------------------------------------

export interface LuxOSStatusEntry {
  STATUS?: string; // 'S' | 'E'
  Code?: number;
  Msg?: string;
  /** Always "LUXminer <version>" — used as a discovery signature */
  Description?: string;
  When?: number;
}

export interface LuxOSEnvelope {
  STATUS?: LuxOSStatusEntry[];
  id?: number;
}

export interface LuxOSVersion {
  API?: string;
  LUXminer?: string;
  Miner?: string;
  CompileTime?: string;
  /** Display name of the miner model, e.g. "Antminer S21" */
  Type?: string;
}

export interface LuxOSSummary {
  'GHS av'?: number;
  'GHS 5s'?: number;
  'GHS 30m'?: number;
  Accepted?: number;
  Rejected?: number;
  Stale?: number;
  'Hardware Errors'?: number;
  'Best Share'?: number;
  'Best Session Share'?: number;
  Elapsed?: number;
  'Difficulty Accepted'?: number;
  'Pool Rejected%'?: number;
  Utility?: number;
}

export interface LuxOSConfig {
  Hostname?: string;
  MACAddr?: string;
  Model?: string;
  /** Nameplate hashrate in TH/s */
  NameplateTHS?: number;
  'ASC Count'?: number;
  Profile?: string;
  ProfileStep?: string;
  IsAtmEnabled?: boolean;
  IsTuning?: boolean;
  RedLed?: string;
  GreenLed?: string;
  /** 'None' | 'Sleep' | 'WakeUp' */
  CurtailMode?: string;
  IsPowerSupplyOn?: boolean;
  SerialNumber?: string;
  /** 'Normal' | 'Initializing' */
  SystemStatus?: string;
  /** 'Air' | 'Hydro' | 'Immersion' */
  Cooling?: string;
  IPAddr?: string;
}

export interface LuxOSPool {
  POOL?: number;
  URL?: string;
  'Stratum URL'?: string;
  User?: string;
  /** 'Dead' | 'Connecting' | 'Alive' | 'Disabled' */
  Status?: string;
  'Stratum Active'?: boolean;
  Accepted?: number;
  Rejected?: number;
  'Best Share'?: number;
  'Last Share Difficulty'?: number;
  Priority?: number;
  GROUP?: number;
}

export interface LuxOSFan {
  FAN?: string;
  ID?: number;
  RPM?: number;
  /** Fan power in percent */
  Speed?: number;
}

/**
 * Per-board temperature entry. Sensor keys vary per model (TopLeft,
 * ChipTopRight, BoardCh0, …) — iterate numeric keys, don't assume a
 * fixed schema. Keys containing "Chip" are die temps; the rest
 * (except ID/TEMP) are board sensors.
 */
export type LuxOSTempEntry = { ID?: number; TEMP?: number } & Record<
  string,
  number | undefined
>;

export interface LuxOSTempCtrl {
  /** 'Automatic' | 'Manual' */
  Mode?: string;
  Hot?: number;
  Dangerous?: number;
  Target?: number;
  ChipHot?: number;
  ChipDangerous?: number;
  ChipTarget?: number;
}

export interface LuxOSPower {
  /** True when Watts is PSU-measured, false when estimated */
  PSU?: boolean;
  Watts?: number;
}

export interface LuxOSProfileWire {
  'Profile Name'?: string;
  Frequency?: number;
  /** Estimated hashrate in TH/s */
  Hashrate?: number;
  Watts?: number;
  Voltage?: number;
  Step?: string;
  IsDynamic?: boolean;
}

interface LuxOSSessionEntry {
  SessionID?: string;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

/**
 * Execute one RPC command. Converts a STATUS 'E' body into an ApiResult
 * failure (code 'LUXOS_E') so callers get a single failure shape.
 * Always retries: 0 — polling retries itself and writes must never be
 * replayed.
 */
async function rpc<T extends LuxOSEnvelope>(
  ip: string,
  command: string,
  parameter?: string,
  signal?: AbortSignal
): Promise<ApiResult<T>> {
  const body =
    parameter !== undefined ? { command, parameter } : { command };
  const result = await postJson<T>(apiUrl(ip), body, {
    timeout: MINER_TIMEOUT,
    retries: 0,
    signal,
  });
  if (!result.success) return result;
  const status = result.data?.STATUS?.[0];
  if (status?.STATUS === 'E') {
    return {
      success: false,
      error: {
        message: status.Msg ?? `LuxOS command '${command}' failed`,
        code: 'LUXOS_E',
      },
    };
  }
  return result;
}

// ---------------------------------------------------------------------------
// Monitoring snapshot (single multi-command round-trip)
// ---------------------------------------------------------------------------

/** Parsed monitoring snapshot — sections missing on-device stay undefined */
export interface LuxOSSnapshot {
  version: LuxOSVersion;
  summary: LuxOSSummary;
  config?: LuxOSConfig;
  pools?: LuxOSPool[];
  fans?: LuxOSFan[];
  temps?: LuxOSTempEntry[];
  tempctrl?: LuxOSTempCtrl;
  power?: LuxOSPower;
  profiles?: LuxOSProfileWire[];
}

/** All parameterless reads, batched per the docs' recommendation */
const SNAPSHOT_CMD =
  'version+summary+config+pools+fans+temps+tempctrl+power+profiles';

/**
 * Extract one command's data array from a multi-command response.
 *
 * Documented shape: body[cmdLower] is an array wrapping the command's
 * full normal response, whose data lives under dataKey:
 *   { "summary": [ { "SUMMARY": [ {...} ], "STATUS": [...] } ], ... }
 * We also tolerate the unwrapped single-command shape (body[dataKey]
 * directly) defensively — this wrapper shape is inferred from a single
 * doc snippet and is the top thing to validate on real hardware.
 * A per-command STATUS 'E' yields undefined (section degrades, the
 * snapshot survives).
 */
function unwrap<T>(
  body: Record<string, unknown>,
  cmdLower: string,
  dataKey: string
): T[] | undefined {
  const direct = body[dataKey];
  if (Array.isArray(direct)) return direct as T[];
  const wrapped = body[cmdLower];
  if (!Array.isArray(wrapped)) return undefined;
  const inner = wrapped[0] as Record<string, unknown> | undefined;
  if (!inner || typeof inner !== 'object') return undefined;
  const data = inner[dataKey];
  return Array.isArray(data) ? (data as T[]) : undefined;
}

/**
 * Fetch the full monitoring snapshot in one HTTP round-trip. Succeeds
 * when version and summary parse; every other section is best-effort.
 */
export async function getSnapshot(
  ip: string,
  signal?: AbortSignal
): Promise<ApiResult<LuxOSSnapshot>> {
  const result = await postJson<Record<string, unknown>>(
    apiUrl(ip),
    { command: SNAPSHOT_CMD },
    { timeout: MINER_TIMEOUT, retries: 0, signal }
  );
  if (!result.success) return result;

  const body = result.data ?? {};
  const version = unwrap<LuxOSVersion>(body, 'version', 'VERSION')?.[0];
  const summary = unwrap<LuxOSSummary>(body, 'summary', 'SUMMARY')?.[0];
  if (!version || !summary) {
    return {
      success: false,
      error: {
        message: 'Unrecognized LuxOS response',
        code: 'LUXOS_PARSE',
      },
    };
  }

  return {
    success: true,
    data: {
      version,
      summary,
      config: unwrap<LuxOSConfig>(body, 'config', 'CONFIG')?.[0],
      pools: boundedRemoteItems(unwrap<LuxOSPool>(body, 'pools', 'POOLS')),
      fans: boundedRemoteItems(unwrap<LuxOSFan>(body, 'fans', 'FANS')),
      temps: boundedRemoteItems(unwrap<LuxOSTempEntry>(body, 'temps', 'TEMPS')),
      tempctrl: unwrap<LuxOSTempCtrl>(body, 'tempctrl', 'TEMPCTRL')?.[0],
      power: unwrap<LuxOSPower>(body, 'power', 'POWER')?.[0],
      profiles: boundedRemoteItems(
        unwrap<LuxOSProfileWire>(body, 'profiles', 'PROFILES')
      ),
    },
  };
}

/**
 * Fetch the configured pools (used by the settings view; the snapshot
 * already includes pools for the monitoring path).
 */
export async function getPools(
  ip: string,
  signal?: AbortSignal
): Promise<ApiResult<LuxOSPool[]>> {
  const result = await rpc<LuxOSEnvelope & { POOLS?: LuxOSPool[] }>(
    ip,
    'pools',
    undefined,
    signal
  );
  if (!result.success) return result;
  return {
    success: true,
    data: boundedRemoteItems(result.data.POOLS) ?? [],
  };
}

// ---------------------------------------------------------------------------
// Session manager (writes only — reads never need a session)
// ---------------------------------------------------------------------------

/** Per-IP write serialization: the device allows only one session */
const sessionQueues = new Map<string, Promise<unknown>>();

/**
 * Run `fn` inside a logon/logoff session scope. Serialized per IP so
 * two concurrent app writes can't race the device's single session.
 * On logon failure (another actor holds the session — detected by
 * STATUS 'E', never by message text) retries once after 2s, then
 * surfaces code 'session_busy'. `kill` is never used (docs forbid
 * stealing/killing other actors' sessions).
 */
export async function withSession<T>(
  ip: string,
  fn: (sessionId: string) => Promise<ApiResult<T>>
): Promise<ApiResult<T>> {
  const prev = sessionQueues.get(ip) ?? Promise.resolve();
  const run = prev.then(async (): Promise<ApiResult<T>> => {
    let logon = await rpc<LuxOSEnvelope & { SESSION?: LuxOSSessionEntry[] }>(
      ip,
      'logon'
    );
    if (!logon.success && logon.error.code === 'LUXOS_E') {
      // Someone else holds the single session; one courtesy retry —
      // sessions expire after 60s idle, so a stuck one clears itself.
      await new Promise((resolve) => setTimeout(resolve, 2000));
      logon = await rpc(ip, 'logon');
    }
    if (!logon.success) {
      if (logon.error.code === 'LUXOS_E') {
        return {
          success: false,
          error: { message: logon.error.message, code: 'session_busy' },
        };
      }
      return logon;
    }
    const sessionId = logon.data.SESSION?.[0]?.SessionID;
    if (!sessionId) {
      return {
        success: false,
        error: { message: 'LuxOS logon returned no session', code: 'LUXOS_PARSE' },
      };
    }
    try {
      return await fn(sessionId);
    } finally {
      // Best-effort; a failed logoff self-expires in 60s
      await rpc(ip, 'logoff', sessionId).catch(() => undefined);
    }
  });
  // Chain regardless of outcome so one failure doesn't wedge the queue
  sessionQueues.set(
    ip,
    run.catch(() => undefined)
  );
  return run;
}

// ---------------------------------------------------------------------------
// Writers — all retries: 0 (writes must never be replayed)
// ---------------------------------------------------------------------------

/**
 * Full device reboot. Responds STATUS S immediately, then the whole
 * rig reboots — HTTP is down for minutes afterwards. The offline/
 * recovery machinery in the store handles the gap.
 */
export async function rebootDevice(ip: string): Promise<ApiResult<LuxOSEnvelope>> {
  return withSession(ip, (sid) => rpc(ip, 'rebootdevice', sid));
}

export type LuxOSLedMode = 'on' | 'off' | 'blink' | 'auto';

/**
 * Set a front-panel LED mode. Unlike AxeOS identify, `blink` persists
 * until changed — callers must restore 'auto' when done locating.
 */
export async function setLed(
  ip: string,
  led: 'red' | 'green',
  mode: LuxOSLedMode
): Promise<ApiResult<LuxOSEnvelope>> {
  return withSession(ip, (sid) => rpc(ip, 'ledset', `${sid},${led},${mode}`));
}

/**
 * Switch the active power profile (Luxor-validated presets, applied to
 * all boards; update_atm defaults true so ATM bounds follow). Numeric
 * names 0–3 are rejected client-side: LUXminer interprets them as a
 * legacy board_id parameter.
 */
export async function setProfile(
  ip: string,
  profileName: string
): Promise<ApiResult<LuxOSEnvelope>> {
  if (/^[0-3]$/.test(profileName.trim())) {
    return {
      success: false,
      error: {
        message: `Profile name '${profileName}' would be interpreted as a legacy board id`,
        code: 'LUXOS_BAD_PROFILE',
      },
    };
  }
  return withSession(ip, (sid) => rpc(ip, 'profileset', `${sid},${profileName}`));
}

// Pool commands are cgminer-namespace: no session required.

/**
 * Add a pool (appended to the current group). Password may be empty —
 * the trailing comma-separated slot is still required by the wire format.
 */
export async function addPool(
  ip: string,
  url: string,
  user: string,
  password?: string
): Promise<ApiResult<LuxOSEnvelope>> {
  return rpc(ip, 'addpool', `${url},${user},${password ?? ''}`);
}

export async function removePool(
  ip: string,
  poolId: number
): Promise<ApiResult<LuxOSEnvelope>> {
  return rpc(ip, 'removepool', String(poolId));
}

/** Make a pool the first choice of its group (triggers a reconnect) */
export async function switchPool(
  ip: string,
  poolId: number
): Promise<ApiResult<LuxOSEnvelope>> {
  return rpc(ip, 'switchpool', String(poolId));
}

// ---------------------------------------------------------------------------
// Discovery probe
// ---------------------------------------------------------------------------

/**
 * Detect whether the host at `ip` runs LuxOS. Sends `version` to the
 * HTTP RPC endpoint on 8080 and requires the LUXminer signature in the
 * response shape, so arbitrary port-8080 web servers can't false-
 * positive. Avalons never answer HTTP on 8080, and LuxOS `version` has
 * no PROD field, so the Avalon TCP probe can't claim a LuxOS miner
 * either — detection is unambiguous in both directions.
 */
export async function isLuxOS(ip: string, signal?: AbortSignal): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT);
  const handleAbort = () => controller.abort();
  signal?.addEventListener('abort', handleAbort);

  try {
    const response = await fetch(apiUrl(ip), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'version' }),
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const data = (await response.json()) as LuxOSEnvelope & {
      VERSION?: LuxOSVersion[];
    };
    if (typeof data !== 'object' || data === null) return false;
    const luxminer = data.VERSION?.[0]?.LUXminer;
    if (typeof luxminer === 'string' && luxminer.length > 0) return true;
    const description = data.STATUS?.[0]?.Description;
    return typeof description === 'string' && description.startsWith('LUXminer');
  } catch {
    // Network error, timeout, or non-JSON body — not a LuxOS miner
    return false;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', handleAbort);
  }
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * Pick the pool the miner is actually mining on: Stratum Active first,
 * then Alive status, then the first configured pool.
 */
export function getActivePool(pools?: LuxOSPool[]): LuxOSPool | undefined {
  if (!pools || pools.length === 0) return undefined;
  return (
    pools.find((p) => p['Stratum Active'] === true) ??
    pools.find((p) => p.Status === 'Alive') ??
    pools[0]
  );
}

/** Max finite value or undefined when nothing numeric is present */
function maxOrUndefined(values: number[]): number | undefined {
  return finiteNumberRange(values)?.max;
}

/**
 * Split a temps entry into board-sensor and chip-die maxima. Sensor
 * keys vary per model, so iterate: numeric fields other than ID/TEMP
 * are sensors; names containing "Chip" are die temps.
 */
function boardAndChipMax(entry: LuxOSTempEntry): {
  board?: number;
  chip?: number;
} {
  const boardVals: number[] = [];
  const chipVals: number[] = [];
  const maxSensorFields = 256;
  let fields = 0;
  for (const key in entry) {
    if (!Object.prototype.hasOwnProperty.call(entry, key)) continue;
    if (fields++ >= maxSensorFields) break;
    const value = entry[key];
    if (key === 'ID' || key === 'TEMP') continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    if (key.includes('Chip')) chipVals.push(value);
    else boardVals.push(value);
  }
  return { board: maxOrUndefined(boardVals), chip: maxOrUndefined(chipVals) };
}

export interface LuxOSAdapterInput {
  ip: string;
  alias?: string;
  snapshot: LuxOSSnapshot;
}

/**
 * Normalize a LuxOS snapshot into a LocalMiner. Null-tolerant: any
 * missing section degrades to zeros/undefined, never a crash. Hashrate
 * fields are already GH/s ('GHS av' / 'GHS 5s') — no conversion.
 */
export function adaptToLocalMiner(input: LuxOSAdapterInput): LocalMiner {
  const { ip, alias, snapshot } = input;
  const { version, summary, config, pools, fans, temps, tempctrl, power, profiles } =
    snapshot;

  const activePool = getActivePool(pools);

  // Parse "stratum+tcp://host:port" the same way the KBox/Avalon adapters do
  let stratumUrl = '';
  let stratumPort = 0;
  const poolUrl = activePool?.URL ?? activePool?.['Stratum URL'];
  if (typeof poolUrl === 'string' && poolUrl.length > 0) {
    const m = poolUrl.match(/^(?:stratum\+tcp:\/\/)?([^:]+)(?::(\d+))?$/);
    if (m) {
      stratumUrl = m[1] ?? '';
      stratumPort = m[2] ? Number(m[2]) : 0;
    }
  }

  // Per-board temperatures, ordered by board ID
  const sortedTemps = temps
    ? temps.slice(0, MAX_REMOTE_ITEMS).sort((a, b) => (a.ID ?? 0) - (b.ID ?? 0))
    : [];
  const perBoard = sortedTemps.map(boardAndChipMax);
  const boardTemps = perBoard
    .map((t) => t.board)
    .filter((t): t is number => typeof t === 'number');
  const chipTemps = perBoard
    .map((t) => t.chip)
    .filter((t): t is number => typeof t === 'number');
  // Chip-die temp is the meaningful one when available; board otherwise.
  // Warning thresholds follow the same preference (see getWarnings).
  const temp = maxOrUndefined(chipTemps) ?? maxOrUndefined(boardTemps) ?? 0;

  const profileList: LuxOSProfile[] = (profiles ?? [])
    .slice(0, MAX_REMOTE_ITEMS)
    .filter(
      (p): p is LuxOSProfileWire & { 'Profile Name': string } =>
        typeof p['Profile Name'] === 'string' && p['Profile Name'].length > 0
    )
    .map((p) => ({
      name: p['Profile Name'],
      frequency: p.Frequency,
      hashrateThs: p.Hashrate,
      watts: p.Watts,
      step: p.Step,
      isDynamic: p.IsDynamic,
    }));
  const activeProfile = config?.Profile
    ? profileList.find((p) => p.name === config.Profile)
    : undefined;

  // Expected hashrate in GH/s: active profile estimate → nameplate → observed
  const hashRate = summary['GHS av'] ?? 0;
  const expectedHashrate =
    (activeProfile?.hashrateThs ?? 0) * 1000 ||
    (config?.NameplateTHS ?? 0) * 1000 ||
    hashRate;

  const fanRpms = (fans ?? [])
    .slice(0, MAX_REMOTE_ITEMS)
    .map((f) => f.RPM)
    .filter((rpm): rpm is number => typeof rpm === 'number');

  const tempLimits: LuxOSTempLimits | undefined = tempctrl
    ? {
        hot: tempctrl.Hot,
        dangerous: tempctrl.Dangerous,
        chipHot: tempctrl.ChipHot,
        chipDangerous: tempctrl.ChipDangerous,
        mode: tempctrl.Mode,
      }
    : undefined;

  return {
    ip,
    alias,
    hostname: config?.Hostname ?? 'LuxOS',
    // Not exposed by the LuxOS API — hidden in the UI for luxos miners
    ASICModel: '',
    deviceModel: config?.Model ?? version.Type ?? 'Antminer',
    minerType: 'luxos',
    expectedHashrate,
    hashRate,
    power: power?.Watts ?? 0,
    temp,
    // Profile voltage is whole volts, LocalMiner.voltage is core mV — skip
    voltage: 0,
    frequency: activeProfile?.frequency ?? 0,
    fanSpeed: fans?.[0]?.Speed ?? 0,
    autoFanSpeed: tempctrl?.Mode === 'Manual' ? 0 : 1,
    targetTemp: tempctrl?.ChipTarget ?? tempctrl?.Target,
    fanRpm: fanRpms[0] ?? 0,
    fanRpms: fanRpms.length > 0 ? fanRpms : undefined,
    bestDiff: summary['Best Share'] ?? 0,
    bestSessionDiff: summary['Best Session Share'] ?? 0,
    sharesAccepted: summary.Accepted ?? 0,
    sharesRejected: summary.Rejected ?? 0,
    hwErrors: summary['Hardware Errors'],
    stratumUser: activePool?.User ?? '',
    stratumUrl,
    stratumPort,
    version: version.LUXminer ?? '',
    uptimeSeconds: summary.Elapsed ?? 0,
    realtimeHashrate: summary['GHS 5s'],
    macAddress: config?.MACAddr,
    serialNumber: config?.SerialNumber,
    asicCount: config?.['ASC Count'],
    // Curtailed (sleeping) or PSU-off reads as standby, not a fault
    isStandby:
      config?.CurtailMode === 'Sleep' || config?.IsPowerSupplyOn === false,
    lastSeen: Date.now(),
    isOnline: true,
    luxosProfile: config?.Profile,
    luxosProfiles: profileList.length > 0 ? profileList : undefined,
    luxosAtmEnabled: config?.IsAtmEnabled,
    luxosRedLed: config?.RedLed,
    luxosGreenLed: config?.GreenLed,
    luxosTempLimits: tempLimits,
    luxosBoardTemps: boardTemps.length > 0 ? boardTemps : undefined,
    luxosChipTemps: chipTemps.length > 0 ? chipTemps : undefined,
    luxosCurtailMode: config?.CurtailMode,
    luxosPowerMeasured: power?.PSU,
  };
}
