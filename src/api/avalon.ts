/**
 * Canaan Avalon CGMiner API client.
 *
 * Targets the JSON RPC interface on TCP port 4028 that ships on Avalon
 * Q / Nano / Mini and most Canaan ASIC firmware. Read commands are
 * unauthenticated; the same applies to `ascset` writes.
 *
 * Pool config and admin-only knobs are NOT reachable here on the
 * Avalon Q firmware (the A10 manual is wrong about `setpool`); use
 * `avalonWeb.ts` with the device's admin password for those.
 *
 * See CANAAN_AVALON_API.md for protocol details and per-model quirks.
 */

import TcpSocket from 'react-native-tcp-socket';
import type {
  ApiResult,
  AvalonWorkMode,
  AvalonWriteCapabilities,
  LocalMiner,
  MinerType,
} from '@/types';

/** Standard CGMiner API port */
export const AVALON_PORT = 4028;

/** Per-command timeout. Local LAN; matches MINER_TIMEOUT for AxeOS. */
export const AVALON_TIMEOUT = 5000;

/**
 * Discovery probe timeout — kept tight so a full /24 scan doesn't drag.
 * One TCP RTT to a non-Avalon host is sub-millisecond; one to a real
 * miner takes a few ms. 2.5s gives ~2× headroom for slow/loaded boxes.
 */
export const AVALON_DISCOVERY_TIMEOUT = 2500;

// ---------------------------------------------------------------------------
// Wire-format types
// ---------------------------------------------------------------------------

interface CgminerStatus {
  STATUS: 'S' | 'I' | 'E';
  When: number;
  Code: number;
  Msg: string;
  Description?: string;
}

interface CgminerEnvelope {
  STATUS: CgminerStatus[];
  id?: number;
  // Section is dynamic and depends on the command (e.g. VERSION, SUMMARY...)
  [section: string]: unknown;
}

export interface AvalonVersion {
  CGMiner: string;
  API: string;
  PROD: string; // e.g. "Avalon Q"
  MODEL: string; // e.g. "Q"
  HWTYPE: string;
  SWTYPE: string;
  LVERSION: string;
  BVERSION: string;
  CGVERSION: string;
  HBMCUVERSION?: string;
  FANMCUVERSION?: string;
  DNA: string;
  MAC: string;
}

export interface AvalonSummary {
  Elapsed: number;
  /** Aggregate hashrate in MH/s */
  'MHS av': number;
  'MHS 5s': number;
  'MHS 1m': number;
  'MHS 5m': number;
  'MHS 15m': number;
  'Found Blocks': number;
  Getworks: number;
  Accepted: number;
  Rejected: number;
  'Hardware Errors': number;
  Utility: number;
  'Difficulty Accepted': number;
  'Difficulty Rejected': number;
  'Best Share': number;
  'Device Hardware%': number;
  'Device Rejected%': number;
  'Pool Rejected%': number;
}

export interface AvalonPool {
  POOL: number;
  URL: string;
  Status: 'Alive' | 'Dead' | 'Disabled' | 'Sick' | 'NoStart';
  Priority: number;
  User: string;
  Password: string;
  Accepted: number;
  Rejected: number;
  'Last Share Time': number;
  'Last Share Difficulty': number;
  'Stratum Active': boolean;
  'Stratum URL'?: string;
  'Best Share': number;
  'Current Block Height'?: number;
}

/**
 * Bracketed key-value blob from cgminer `stats` / `estats`. We expose it
 * as a typed record after parsing — see {@link parseMmSummary}.
 */
export interface AvalonMmStats {
  Ver?: string;
  LVer?: string;
  BVer?: string;
  HashMcu0Ver?: string;
  FanMcuVer?: string;
  CPU?: string;
  DNA?: string;
  STATE?: number;
  MEMFREE?: number;
  Elapsed?: number;
  LW?: number;
  HW?: number;
  DH?: number;
  /** Inlet ambient temp °C */
  ITemp?: number;
  /** Hashboard inlet temp °C */
  HBITemp?: number;
  /** Hashboard outlet temp °C */
  HBOTemp?: number;
  /** Max ASIC temp °C */
  TMax?: number;
  /** Average ASIC temp °C */
  TAvg?: number;
  /** Target temp °C the firmware steers towards */
  TarT?: number;
  Fan1?: number;
  Fan2?: number;
  Fan3?: number;
  Fan4?: number;
  /** Fan duty cycle 0–100 */
  FanR?: number;
  FanErr?: number;
  /** Real-time hashrate in GH/s */
  GHSspd?: number;
  /** Reported hashrate from the MM in GH/s */
  GHSmm?: number;
  /** Average hashrate in GH/s */
  GHSavg?: number;
  /** Work units / minute */
  WU?: number;
  /** Current operating frequency in MHz */
  Freq?: number;
  /** Total ASIC count */
  TA?: number;
  /** ASIC core revision (e.g. "A3197S") */
  Core?: string;
  BIN?: number;
  /** Pool RTT in ms */
  PING?: number;
  /** Working mode (matches dashboard `workingmode`) */
  WORKMODE?: AvalonWorkMode;
  WORKLEVEL?: number;
  /** Max power at the current mode (W) */
  MPO?: number;
  /** Power supply telemetry — 7 ints, mapping not fully decoded */
  PS?: number[];
  // Raw fallthrough for fields we haven't typed yet.
  [key: string]: unknown;
}

export interface AvalonHbInfo {
  /** Per-ASIC inlet temperatures (one entry per ASIC, ~160 on the Q) */
  PVT_T0?: number[];
  /** Per-ASIC voltages in mV */
  PVT_V0?: number[];
  /** Per-ASIC megawork counters */
  MW0?: number[];
  [key: string]: unknown;
}

export interface AvalonStats {
  /** Parsed MM ID0:Summary blob */
  mm: AvalonMmStats;
  /** Parsed HBinfo (only present when fetched via `estats`) */
  hb?: AvalonHbInfo;
  /** Cgminer-level stats wrapper fields */
  Elapsed: number;
  ID: string;
}

// ---------------------------------------------------------------------------
// TCP transport
// ---------------------------------------------------------------------------

/**
 * Send a single CGMiner command and return the parsed envelope.
 *
 * Cgminer uses short connections: open socket, send one command, read
 * until close-or-NUL, close. Reusing a socket for a second command is
 * unsupported and the device is single-threaded — serialize calls.
 */
export function sendCommand(
  ip: string,
  command: string,
  parameter?: string,
  timeoutMs: number = AVALON_TIMEOUT
): Promise<ApiResult<CgminerEnvelope>> {
  return new Promise((resolve) => {
    const payload = JSON.stringify(
      parameter !== undefined ? { command, parameter } : { command }
    );

    let buffer = '';
    let settled = false;
    const settle = (result: ApiResult<CgminerEnvelope>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.destroy();
      } catch {
        // ignore — already closed
      }
      resolve(result);
    };

    const socket = TcpSocket.createConnection(
      { host: ip, port: AVALON_PORT },
      () => {
        socket.write(payload);
      }
    );

    const timer = setTimeout(() => {
      settle({
        success: false,
        error: { message: 'Timeout', code: 'TIMEOUT' },
      });
    }, timeoutMs);

    socket.on('data', (chunk: string | { toString(encoding?: string): string }) => {
      buffer +=
        typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      // Cgminer terminates the JSON object with a NUL byte. As soon as
      // we see one, we have the full reply.
      if (buffer.includes('\0')) {
        finish();
      }
    });

    socket.on('close', () => {
      // Some firmware variants close without a NUL terminator.
      finish();
    });

    socket.on('error', (err: Error) => {
      settle({
        success: false,
        error: { message: err.message || 'Socket error', code: 'NETWORK_ERROR' },
      });
    });

    const finish = () => {
      const text = buffer.replace(/\0+$/g, '').trim();
      if (!text) {
        settle({
          success: false,
          error: { message: 'Empty response', code: 'EMPTY_RESPONSE' },
        });
        return;
      }
      try {
        const parsed = JSON.parse(text) as CgminerEnvelope;
        settle({ success: true, data: parsed });
      } catch (err) {
        settle({
          success: false,
          error: {
            message: `Parse error: ${(err as Error).message}`,
            code: 'PARSE_ERROR',
          },
        });
      }
    };
  });
}

/**
 * Type-narrow a CGMiner envelope into a successful result with the
 * named section, or surface an error if the device returned STATUS:E.
 */
function unwrap<TSection>(
  envelope: CgminerEnvelope,
  section: string
): ApiResult<TSection[]> {
  const status = envelope.STATUS?.[0];
  if (status?.STATUS === 'E') {
    return {
      success: false,
      error: {
        message: status.Msg || 'Cgminer error',
        code: `CGMINER_${status.Code}`,
      },
    };
  }
  const data = envelope[section];
  if (!Array.isArray(data)) {
    return {
      success: false,
      error: {
        message: `Missing ${section} section`,
        code: 'MISSING_SECTION',
      },
    };
  }
  return { success: true, data: data as TSection[] };
}

// ---------------------------------------------------------------------------
// Read commands
// ---------------------------------------------------------------------------

export async function getVersion(
  ip: string,
  timeoutMs?: number
): Promise<ApiResult<AvalonVersion>> {
  const env = await sendCommand(ip, 'version', undefined, timeoutMs);
  if (!env.success) return env;
  const list = unwrap<AvalonVersion>(env.data, 'VERSION');
  if (!list.success) return list;
  return { success: true, data: list.data[0] };
}

export async function getSummary(
  ip: string,
  timeoutMs?: number
): Promise<ApiResult<AvalonSummary>> {
  const env = await sendCommand(ip, 'summary', undefined, timeoutMs);
  if (!env.success) return env;
  const list = unwrap<AvalonSummary>(env.data, 'SUMMARY');
  if (!list.success) return list;
  return { success: true, data: list.data[0] };
}

export async function getPools(
  ip: string,
  timeoutMs?: number
): Promise<ApiResult<AvalonPool[]>> {
  const env = await sendCommand(ip, 'pools', undefined, timeoutMs);
  if (!env.success) return env;
  return unwrap<AvalonPool>(env.data, 'POOLS');
}

/**
 * `stats` returns the MM bracket-string but no HBinfo. Use `getEStats`
 * when you need per-ASIC PVT data — it's heavier but a strict superset.
 */
export async function getStats(
  ip: string,
  timeoutMs?: number
): Promise<ApiResult<AvalonStats>> {
  return fetchStats(ip, 'stats', timeoutMs);
}

export async function getEStats(
  ip: string,
  timeoutMs?: number
): Promise<ApiResult<AvalonStats>> {
  return fetchStats(ip, 'estats', timeoutMs);
}

async function fetchStats(
  ip: string,
  command: 'stats' | 'estats',
  timeoutMs?: number
): Promise<ApiResult<AvalonStats>> {
  const env = await sendCommand(ip, command, undefined, timeoutMs);
  if (!env.success) return env;
  const list = unwrap<Record<string, unknown>>(env.data, 'STATS');
  if (!list.success) return list;

  // cgminer's STATS array can carry the MM blob in any row depending on
  // firmware build. On Avalon Q (MM319) row 0 holds it; older builds
  // and other models put it later. Scan all rows instead of trusting
  // a fixed index.
  const mmRow = list.data.find((r) =>
    Object.keys(r).some((k) => /^MM ID\d+/.test(k))
  );
  const mmKey = mmRow
    ? Object.keys(mmRow).find((k) => /^MM ID\d+/.test(k))
    : undefined;
  const mm: AvalonMmStats =
    mmRow && mmKey ? parseMmSummary(String(mmRow[mmKey] ?? '')) : {};

  const hbRow = list.data.find((r) => typeof r.HBinfo === 'string');
  const hb =
    hbRow && typeof hbRow.HBinfo === 'string'
      ? parseHbInfo(hbRow.HBinfo)
      : undefined;

  const meta = mmRow ?? list.data[0];
  if (!meta) {
    return {
      success: false,
      error: { message: 'No STATS rows', code: 'EMPTY_STATS' },
    };
  }
  return {
    success: true,
    data: {
      mm,
      hb,
      Elapsed: Number(meta.Elapsed ?? 0),
      ID: String(meta.ID ?? ''),
    },
  };
}

// ---------------------------------------------------------------------------
// MM / HB blob parsing
// ---------------------------------------------------------------------------

/**
 * Parse a single bracketed key-value blob.
 *
 *   Input:  "'STATS':{Ver[Q-25052801] STATE[1] PS[0 1216 2411 53 1298 2412 1391]}"
 *   Output: {Ver: "Q-25052801", STATE: 1, PS: [0, 1216, 2411, 53, 1298, 2412, 1391]}
 *
 * Numeric strings convert to numbers. Space-separated numeric strings
 * convert to number arrays. Everything else stays as a string.
 */
export function parseMmSummary(blob: string): AvalonMmStats {
  const out: AvalonMmStats = {};
  // Match key[value] where value can contain anything except an
  // unbalanced ']'. The stats blob doesn't nest brackets.
  const re = /(\w+)\[([^\]]*)\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(blob)) !== null) {
    const [, key, raw] = match;
    out[key] = coerceMmValue(raw);
  }
  return out;
}

/**
 * HBinfo follows the same `key[value]` pattern but inside an outer
 * `'HBn':{ ... }` wrapper. Reuse the MM parser on the inner content.
 */
export function parseHbInfo(blob: string): AvalonHbInfo {
  // Strip the outer `'HBn':{ ... }` if present.
  const inner = blob.replace(/^'HB\d+':\{/, '').replace(/\}$/, '');
  return parseMmSummary(inner) as AvalonHbInfo;
}

function coerceMmValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  // Some percentage fields are reported with a trailing `%` (FanR, DH,
  // DHspd on Q firmware). Strip it so they coerce to numbers — callers
  // know from the field name that the unit is %.
  const pctStripped =
    trimmed.endsWith('%') && /^-?\d+(\.\d+)?%$/.test(trimmed)
      ? trimmed.slice(0, -1)
      : trimmed;
  // Single number? (signed, decimal, scientific not used by firmware)
  if (/^-?\d+(\.\d+)?$/.test(pctStripped)) {
    return Number(pctStripped);
  }
  // Whitespace-separated number list?
  if (/^[-\d\s.]+$/.test(trimmed) && /\s/.test(trimmed)) {
    const parts = trimmed.split(/\s+/);
    if (parts.every((p) => /^-?\d+(\.\d+)?$/.test(p))) {
      return parts.map(Number);
    }
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Write commands (ascset)
// ---------------------------------------------------------------------------

/**
 * Send `ascset` and resolve to ok/error. Most write paths are not used
 * directly by callers — prefer the higher-level helpers below.
 */
async function ascset(
  ip: string,
  args: string,
  timeoutMs?: number
): Promise<ApiResult<void>> {
  const env = await sendCommand(ip, 'ascset', args, timeoutMs);
  if (!env.success) return env;
  const status = env.data.STATUS?.[0];
  if (status?.STATUS === 'S') return { success: true, data: undefined };
  return {
    success: false,
    error: {
      message: status?.Msg || 'ascset failed',
      code: `CGMINER_${status?.Code ?? 'UNKNOWN'}`,
    },
  };
}

/**
 * Reboot the miner. Verified working on Avalon Q firmware MM319.
 * The miner takes ~3–4 minutes to come back online; callers should
 * poll `getVersion` until success or a 4-minute timeout.
 */
export function reboot(ip: string): Promise<ApiResult<void>> {
  return ascset(ip, '0,reboot,0');
}

/**
 * Read current work mode (0=Eco, 1=Standard, 2=Super on Q).
 * The cgminer reply is an info message like "ASC 0 set info: workmode 1";
 * we parse the trailing integer.
 */
export async function getWorkMode(
  ip: string
): Promise<ApiResult<AvalonWorkMode>> {
  const env = await sendCommand(ip, 'ascset', '0,workmode,get');
  if (!env.success) return env;
  const status = env.data.STATUS?.[0];
  const match = status?.Msg?.match(/workmode\s+(\d+)/i);
  if (!match) {
    return {
      success: false,
      error: {
        message: status?.Msg || 'Could not parse workmode',
        code: 'PARSE_ERROR',
      },
    };
  }
  const value = Number(match[1]);
  if (value !== 0 && value !== 1 && value !== 2) {
    return {
      success: false,
      error: {
        message: `Unexpected workmode value: ${value}`,
        code: 'PARSE_ERROR',
      },
    };
  }
  return { success: true, data: value as AvalonWorkMode };
}

/**
 * Set the work mode. Returns success on `ASC 0 set OK`. Per Canaan's
 * Mini 3 KB, **the new mode does not take effect until the miner is
 * rebooted** — call `reboot()` after a successful set, then poll for
 * recovery. The app's settings UI should make this prompt explicit.
 */
export function setWorkMode(
  ip: string,
  mode: AvalonWorkMode
): Promise<ApiResult<void>> {
  return ascset(ip, `0,workmode,set,${mode}`);
}

/**
 * Toggle the LCD on/off. Format: `lcd,<index>:<value>` where index 0
 * targets the LCD on the Q. `value` 1 = on, 0 = off.
 */
export function setLcd(ip: string, on: boolean): Promise<ApiResult<void>> {
  return ascset(ip, `0,lcd,0:${on ? 1 : 0}`);
}

/**
 * Soft-off the miner (enter standby) at the given unix timestamp. Pass
 * `Math.floor(Date.now() / 1000) + 5` for an "in 5 seconds" trigger,
 * matching the upstream avalon-q-controller convention.
 */
export function softOff(
  ip: string,
  unixTimestamp: number
): Promise<ApiResult<void>> {
  return ascset(ip, `0,softoff,1:${unixTimestamp}`);
}

/**
 * Wake the miner from standby at the given unix timestamp.
 */
export function softOn(
  ip: string,
  unixTimestamp: number
): Promise<ApiResult<void>> {
  return ascset(ip, `0,softon,1:${unixTimestamp}`);
}

// ---------------------------------------------------------------------------
// Capability detection + LocalMiner adapter
// ---------------------------------------------------------------------------

/**
 * Ask the firmware for its full `ascset` vocabulary in one call. The
 * Avalon firmware self-describes via `ascset|0,help`, returning a
 * pipe-delimited option list as an info message. This is the
 * authoritative way to feature-detect — much more reliable than
 * probing individual options blind.
 */
export async function getCapabilities(
  ip: string
): Promise<ApiResult<AvalonWriteCapabilities>> {
  const env = await sendCommand(ip, 'ascset', '0,help');
  if (!env.success) return env;
  const status = env.data.STATUS?.[0];
  // Help reply is "ASC 0 set info: help|voltage|fan-spd|..."
  const match = status?.Msg?.match(/set info:\s*(.+)/);
  if (!match) {
    return {
      success: false,
      error: {
        message: status?.Msg || 'Unexpected help reply',
        code: 'PARSE_ERROR',
      },
    };
  }
  const allOptions = match[1]
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
  const has = (name: string) => allOptions.includes(name);
  return {
    success: true,
    data: {
      allOptions,
      reboot: has('reboot'),
      workmode: has('workmode'),
      setpool: has('setpool'),
      lcd: has('lcd'),
      softPower: has('softon') && has('softoff'),
    },
  };
}

/**
 * Check whether the host at `ip` looks like an Avalon. Used by the
 * subnet scanner; intentionally cheap and fast-failing.
 */
export async function isAvalon(ip: string): Promise<boolean> {
  const result = await getVersion(ip, AVALON_DISCOVERY_TIMEOUT);
  if (!result.success) return false;
  return (
    typeof result.data.PROD === 'string' &&
    result.data.PROD.toLowerCase().includes('avalon')
  );
}

/**
 * Detect whether a string looks like an Avalon model identifier.
 * The web UI's `hwtype` substring check covers the same cases.
 */
export function avalonModelFromHwType(hwtype: string): string {
  if (/Nano3s/i.test(hwtype)) return 'Avalon Nano 3S';
  if (/Mini3/i.test(hwtype)) return 'Avalon Mini 3';
  if (/Q/.test(hwtype)) return 'Avalon Q';
  return hwtype || 'Avalon';
}

/**
 * Compose a `LocalMiner` from one round of cgminer reads. Caller
 * decides whether to fetch `getEStats` (for PVT arrays) or just
 * `getStats` — the adapter copes with `hb` being undefined.
 */
export interface AvalonAdapterInput {
  ip: string;
  alias?: string;
  version: AvalonVersion;
  summary: AvalonSummary;
  pools: AvalonPool[];
  stats: AvalonStats;
}

export function adaptToLocalMiner(input: AvalonAdapterInput): LocalMiner {
  const { ip, alias, version, summary, pools, stats } = input;
  const mm = stats.mm;
  const activePool = pools.find((p) => p['Stratum Active']) ?? pools[0];

  // Avalon reports hashrate in MH/s; LocalMiner stores GH/s.
  const hashRateGh = (summary['MHS av'] ?? 0) / 1000;

  // Extract worker-name + stratum URL+port from the active pool.
  // Pool URLs look like "stratum+tcp://host.example:4444".
  let stratumUrl = '';
  let stratumPort = 0;
  if (activePool?.URL) {
    const m = activePool.URL.match(/^(?:stratum\+tcp:\/\/)?([^:]+)(?::(\d+))?$/);
    if (m) {
      stratumUrl = m[1] ?? '';
      stratumPort = m[2] ? Number(m[2]) : 0;
    }
  }

  const fanRpms = [mm.Fan1, mm.Fan2, mm.Fan3, mm.Fan4].filter(
    (v): v is number => typeof v === 'number' && v > 0
  );
  const avgFanRpm =
    fanRpms.length > 0
      ? Math.round(fanRpms.reduce((a, b) => a + b, 0) / fanRpms.length)
      : 0;

  // Live power draw is PS[6] (the 7th element of the power-supply
  // telemetry array). MPO is the mode's max-power *setting* — e.g.
  // Eco shows MPO=800 while the supply actually draws ~865W.
  // Match the web dashboard by preferring PS[6] when available.
  const livePower =
    Array.isArray(mm.PS) && typeof mm.PS[6] === 'number' ? mm.PS[6] : 0;
  const power =
    livePower > 0 ? livePower : typeof mm.MPO === 'number' ? mm.MPO : 0;

  return {
    ip,
    alias,
    hostname: avalonModelFromHwType(version.HWTYPE),
    ASICModel: typeof mm.Core === 'string' ? mm.Core : '',
    deviceModel: avalonModelFromHwType(version.HWTYPE),
    minerType: 'avalon' as MinerType,
    expectedHashrate: typeof mm.MPO === 'number' ? hashRateGh : hashRateGh,
    hashRate: hashRateGh,
    power,
    temp: typeof mm.TMax === 'number' ? mm.TMax : 0,
    voltage: 0, // Avalon doesn't expose a single board voltage in MM stats
    frequency: typeof mm.Freq === 'number' ? Math.round(mm.Freq) : 0,
    fanSpeed: typeof mm.FanR === 'number' ? mm.FanR : 0,
    autoFanSpeed: 1, // Avalon firmware always controls fans automatically
    fanRpm: avgFanRpm,
    bestDiff: summary['Best Share'] ?? 0,
    bestSessionDiff: summary['Best Share'] ?? 0,
    sharesAccepted: summary.Accepted ?? 0,
    sharesRejected: summary.Rejected ?? 0,
    stratumUser: activePool?.User ?? '',
    stratumUrl,
    stratumPort,
    version: version.LVERSION ?? version.CGVERSION ?? '',
    uptimeSeconds: summary.Elapsed ?? 0,
    lastSeen: Date.now(),
    isOnline: true,
    workMode: typeof mm.WORKMODE === 'number' ? mm.WORKMODE : undefined,
    workLevel: typeof mm.WORKLEVEL === 'number' ? mm.WORKLEVEL : undefined,
    hashboardInletTemp: typeof mm.HBITemp === 'number' ? mm.HBITemp : undefined,
    hashboardOutletTemp: typeof mm.HBOTemp === 'number' ? mm.HBOTemp : undefined,
    fanRpms: fanRpms.length > 0 ? fanRpms : undefined,
    asicTemps: stats.hb?.PVT_T0,
    asicVoltages: stats.hb?.PVT_V0,
    asicCount: typeof mm.TA === 'number' ? mm.TA : undefined,
    macAddress: formatMac(version.MAC),
    poolPing: typeof mm.PING === 'number' ? mm.PING : undefined,
    bestShareDifficulty: summary['Best Share'] ?? undefined,
  };
}

/**
 * Format a 12-char hex MAC ("aabbccddeeff") as colon-separated
 * ("aa:bb:cc:dd:ee:ff"). Returns the original on length mismatch.
 */
function formatMac(raw: string): string {
  if (typeof raw !== 'string' || raw.length !== 12) return raw;
  return (raw.match(/.{2}/g) ?? []).join(':');
}
