/**
 * GekkoScience KBox local API client (firmware v1.19.4, API v1).
 *
 * HTTP/JSON on port 80 under /api/v1/. Every request requires an
 * `X-API-Key` header — the owner generates the 32-char key in the KBox
 * web UI (Settings → System → API Access). Responses always carry an
 * `ok` boolean; failures add `error` (short code) and `message`.
 * Auth failures: 401 {"ok":false,"error":"unauthorized"},
 * 403 {"ok":false,"error":"api_disabled"}.
 *
 * NOTE: written doc-driven without hardware — every wire field is
 * optional/nullable because the docs state any field may be null or
 * absent during the ~30-60s startup ramp after power-on or restart.
 */

import type { ApiResult, LocalMiner, KBoxLedState, KBoxAuthError } from '@/types';
import { fetchWithTimeout, postJson, MINER_TIMEOUT } from './client';
import { parseDifficulty } from '@/utils/formatting';

/** Probe timeout for discovery (ms) — matches discovery.ts fast-fail */
const PROBE_TIMEOUT = 5000;

/**
 * Nominal KBox hashrate in GH/s (single BM1370 board, ~4.2 TH/s).
 * Kept local — minerStore's BM1370 expected-hashrate entry is the
 * Bitaxe Gamma (1200 GH/s) and must not be reused here.
 */
export const KBOX_EXPECTED_HASHRATE_GH = 4200;

/** Custom power-mode bounds documented for POST /api/v1/power */
export const KBOX_FREQ_MIN = 250;
export const KBOX_FREQ_MAX = 650;
export const KBOX_COREV_MIN = 260;
export const KBOX_COREV_MAX = 320;

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

interface KBoxEnvelope {
  ok?: boolean;
  error?: string;
  message?: string;
}

interface KBoxWireLed {
  on?: boolean | null;
  effect?: string | null;
  color?: { r?: number; g?: number; b?: number } | null;
  speed?: number | null;
  brightness?: number | null;
}

export interface KBoxStatus extends KBoxEnvelope {
  hashrate_ths?: number | null;
  hashrate_1m_ths?: number | null;
  accepted?: number | null;
  rejected?: number | null;
  hardware_errors?: number | null;
  /** Pre-formatted string like "301K" / "2.23T" */
  best_share?: string | number | null;
  uptime_s?: number | null;
  temperature_c?: number | null;
  pool?: { url?: string; user?: string; difficulty?: number } | null;
  power_mode?: string | null;
  fan_percent?: number | null;
  dual_mining?: boolean | null;
  led?: KBoxWireLed | null;
}

export interface KBoxDevice {
  id?: number;
  status?: string;
  enabled?: string;
  temperature_c?: number | null;
  hashrate_ths?: number | null;
  accepted?: number | null;
  rejected?: number | null;
  hardware_errors?: number | null;
  frequency?: number | null;
}

export interface KBoxPool {
  index?: number;
  url?: string;
  user?: string;
  status?: string;
  active?: boolean;
  quota?: number;
  accepted?: number;
  rejected?: number;
  work_difficulty?: number;
}

export interface KBoxDual extends KBoxEnvelope {
  enabled?: boolean;
  bias?: number;
  total_ths?: number | null;
  pools?: KBoxPool[];
}

export interface KBoxLedEffect {
  /** Send this exact string (case-insensitive) as `effect` */
  name: string;
  label?: string;
  /** True if the effect honours a custom {r,g,b} */
  color?: boolean;
  /** Basic · Motion · Colour · Ambient · Brand */
  group?: string;
  desc?: string;
}

export type KBoxLedUpdate = {
  on?: boolean;
  effect?: string;
  color?: { r: number; g: number; b: number };
  speed?: number;
  brightness?: number;
};

export type KBoxFanUpdate = { mode: 'auto' } | { percent: number };

export type KBoxPowerUpdate =
  | { mode: 'Low' | 'Medium' | 'High' }
  | { freq: number; corev: number };

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

function headers(apiKey: string): Record<string, string> {
  return { 'X-API-Key': apiKey };
}

function baseUrl(ip: string): string {
  return `http://${ip}/api/v1`;
}

export async function getStatus(
  ip: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<ApiResult<KBoxStatus>> {
  return fetchWithTimeout<KBoxStatus>(`${baseUrl(ip)}/status`, {
    timeout: MINER_TIMEOUT,
    retries: 0, // match the other miner clients — polling retries itself
    parseErrorBody: true,
    headers: headers(apiKey),
    signal,
  });
}

export async function getDevices(
  ip: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<ApiResult<KBoxEnvelope & { devices?: KBoxDevice[] }>> {
  return fetchWithTimeout(`${baseUrl(ip)}/devices`, {
    timeout: MINER_TIMEOUT,
    retries: 0, // match the other miner clients — polling retries itself
    parseErrorBody: true,
    headers: headers(apiKey),
    signal,
  });
}

export async function getPools(
  ip: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<ApiResult<KBoxEnvelope & { pools?: KBoxPool[] }>> {
  return fetchWithTimeout(`${baseUrl(ip)}/pools`, {
    timeout: MINER_TIMEOUT,
    retries: 0, // match the other miner clients — polling retries itself
    parseErrorBody: true,
    headers: headers(apiKey),
    signal,
  });
}

export async function getDual(
  ip: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<ApiResult<KBoxDual>> {
  return fetchWithTimeout<KBoxDual>(`${baseUrl(ip)}/dual`, {
    timeout: MINER_TIMEOUT,
    retries: 0, // match the other miner clients — polling retries itself
    parseErrorBody: true,
    headers: headers(apiKey),
    signal,
  });
}

/**
 * LED effect catalogue. Static per firmware build, so cached per IP for
 * the app session (docs: fetch at runtime, never hard-code the list).
 * Pass `force` to bypass the cache (e.g. after an unknown-effect 400).
 */
const effectsCache = new Map<string, KBoxLedEffect[]>();

export async function getLedEffects(
  ip: string,
  apiKey: string,
  options?: { force?: boolean; signal?: AbortSignal }
): Promise<ApiResult<KBoxLedEffect[]>> {
  if (!options?.force) {
    const cached = effectsCache.get(ip);
    if (cached) return { success: true, data: cached };
  }
  const result = await fetchWithTimeout<
    KBoxEnvelope & { effects?: KBoxLedEffect[] }
  >(`${baseUrl(ip)}/led/effects`, {
    timeout: MINER_TIMEOUT,
    retries: 0, // match the other miner clients — polling retries itself
    parseErrorBody: true,
    headers: headers(apiKey),
    signal: options?.signal,
  });
  if (!result.success) return result;
  const effects = (result.data.effects ?? []).filter(
    (e): e is KBoxLedEffect => typeof e?.name === 'string' && e.name.length > 0
  );
  effectsCache.set(ip, effects);
  return { success: true, data: effects };
}

// ---------------------------------------------------------------------------
// Writers — retries: 0 (never retry a POST; a retried restart would hit
// the firmware's 90s debounce and any retried write is non-idempotent-ish)
// ---------------------------------------------------------------------------

/**
 * Update the ambient LEDs. Any subset of fields; sending color/effect/
 * brightness implicitly turns the lights on. Response echoes the
 * resulting LED state.
 */
export async function setLed(
  ip: string,
  apiKey: string,
  update: KBoxLedUpdate
): Promise<ApiResult<KBoxEnvelope & KBoxWireLed & { led?: KBoxWireLed }>> {
  return postJson(`${baseUrl(ip)}/led`, update, {
    timeout: MINER_TIMEOUT,
    retries: 0,
    parseErrorBody: true,
    headers: headers(apiKey),
  });
}

/**
 * Fan control: {mode:'auto'} or a minimum percent floor (0 = auto).
 * The firmware applies the floor up-only and its 110°C cutoff always
 * overrides whatever we set.
 */
export async function setFan(
  ip: string,
  apiKey: string,
  update: KBoxFanUpdate
): Promise<ApiResult<KBoxEnvelope & { fan_percent?: number; auto?: boolean }>> {
  return postJson(`${baseUrl(ip)}/fan`, update, {
    timeout: MINER_TIMEOUT,
    retries: 0,
    parseErrorBody: true,
    headers: headers(apiKey),
  });
}

/**
 * Power mode: preset Low/Medium/High, or a custom overclock
 * {freq 250-650 MHz, corev 260-320 mV}. Custom reverts to Medium on
 * reboot; the firmware's 70°C watchdog governs regardless. Out-of-range
 * custom values are rejected client-side before touching the wire.
 */
export async function setPower(
  ip: string,
  apiKey: string,
  update: KBoxPowerUpdate
): Promise<
  ApiResult<
    KBoxEnvelope & {
      mode?: string;
      freq?: number;
      corev?: number;
      fan_percent?: number;
    }
  >
> {
  if ('freq' in update) {
    if (
      update.freq < KBOX_FREQ_MIN ||
      update.freq > KBOX_FREQ_MAX ||
      update.corev < KBOX_COREV_MIN ||
      update.corev > KBOX_COREV_MAX
    ) {
      return {
        success: false,
        error: {
          message: `freq must be ${KBOX_FREQ_MIN}-${KBOX_FREQ_MAX} MHz, corev ${KBOX_COREV_MIN}-${KBOX_COREV_MAX} mV`,
          code: 'out_of_range',
        },
      };
    }
  }
  return postJson(`${baseUrl(ip)}/power`, update, {
    timeout: MINER_TIMEOUT,
    retries: 0,
    parseErrorBody: true,
    headers: headers(apiKey),
  });
}

/**
 * Restart the miner process. Firmware debounces to once per 90s (a
 * rejected call returns ok:false — surfaced via the error code).
 * Unlike AxeOS, the Pi's HTTP server stays up during the restart, so a
 * normal JSON response is expected here (no treat-timeout-as-success).
 */
export async function restart(
  ip: string,
  apiKey: string
): Promise<ApiResult<KBoxEnvelope>> {
  return postJson(`${baseUrl(ip)}/restart`, {}, {
    timeout: MINER_TIMEOUT,
    retries: 0,
    parseErrorBody: true,
    headers: headers(apiKey),
  });
}

// ---------------------------------------------------------------------------
// Discovery probe
// ---------------------------------------------------------------------------

/**
 * Detect whether the host at `ip` is a KBox — without needing the API
 * key. A KBox answers an unauthenticated GET /api/v1/status with either
 * 200 {"ok":true,...} (auth off? shouldn't happen per docs, but
 * tolerated) or the distinctive 401/403 JSON envelope. We require the
 * exact envelope shape, not just the status code, so routers, captive
 * portals and other port-80 devices (which return HTML or different
 * JSON) can never false-positive.
 */
export async function isKBox(ip: string, signal?: AbortSignal): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT);
  const handleAbort = () => controller.abort();
  signal?.addEventListener('abort', handleAbort);

  try {
    const response = await fetch(`http://${ip}/api/v1/status`, {
      signal: controller.signal,
    });

    if (response.ok) {
      const data = (await response.json()) as KBoxStatus;
      return (
        typeof data === 'object' &&
        data !== null &&
        data.ok === true &&
        (typeof data.hashrate_ths === 'number' ||
          'power_mode' in data ||
          'hashrate_ths' in data)
      );
    }

    if (response.status === 401 || response.status === 403) {
      const data = (await response.json()) as KBoxEnvelope;
      return (
        typeof data === 'object' &&
        data !== null &&
        data.ok === false &&
        (data.error === 'unauthorized' || data.error === 'api_disabled')
      );
    }

    return false;
  } catch {
    // Network error, timeout, or non-JSON body — not a KBox
    return false;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', handleAbort);
  }
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export interface KBoxAdapterInput {
  ip: string;
  alias?: string;
  status?: KBoxStatus;
  devices?: KBoxDevice[];
  /** Set for the locked (no/bad key or API disabled) stub variant */
  authError?: KBoxAuthError;
}

/**
 * Normalize KBox wire data into a LocalMiner. Null-tolerant throughout:
 * during the startup ramp any status field may be null/absent, and that
 * must render as "warming up" zeros, never as offline or an error.
 *
 * The locked variant (authError set, no status) yields zeroed stats with
 * expectedHashrate 0 so the low-hashrate warning can't fire; the device
 * is reachable, so isOnline stays true.
 */
export function adaptToLocalMiner(input: KBoxAdapterInput): LocalMiner {
  const { ip, alias, status, devices, authError } = input;
  const device = devices?.[0];

  // Parse "stratum+tcp://host:port" the same way the Avalon adapter does
  let stratumUrl = '';
  let stratumPort = 0;
  const poolUrl = status?.pool?.url;
  if (typeof poolUrl === 'string' && poolUrl.length > 0) {
    const m = poolUrl.match(/^(?:stratum\+tcp:\/\/)?([^:]+)(?::(\d+))?$/);
    if (m) {
      stratumUrl = m[1] ?? '';
      stratumPort = m[2] ? Number(m[2]) : 0;
    }
  }

  const hashRateGh =
    typeof status?.hashrate_ths === 'number' ? status.hashrate_ths * 1000 : 0;
  const realtimeGh =
    typeof status?.hashrate_1m_ths === 'number'
      ? status.hashrate_1m_ths * 1000
      : undefined;

  const bestDiff = parseDifficulty(status?.best_share ?? 0);

  const led = status?.led;
  const ledColor = led?.color;
  const kboxLed: KBoxLedState | undefined = led
    ? {
        on: led.on === true,
        effect: typeof led.effect === 'string' ? led.effect : undefined,
        color:
          ledColor &&
          typeof ledColor.r === 'number' &&
          typeof ledColor.g === 'number' &&
          typeof ledColor.b === 'number'
            ? { r: ledColor.r, g: ledColor.g, b: ledColor.b }
            : undefined,
        speed: typeof led.speed === 'number' ? led.speed : undefined,
        brightness:
          typeof led.brightness === 'number' ? led.brightness : undefined,
      }
    : undefined;

  return {
    ip,
    alias,
    hostname: 'KBox',
    ASICModel: 'BM1370',
    deviceModel: 'GekkoScience KBox',
    minerType: 'kbox',
    expectedHashrate: authError ? 0 : KBOX_EXPECTED_HASHRATE_GH,
    hashRate: hashRateGh,
    // Not exposed by the KBox API — hidden in the UI for kbox miners
    power: 0,
    voltage: 0,
    temp: status?.temperature_c ?? device?.temperature_c ?? 0,
    frequency: device?.frequency ?? 0,
    fanSpeed: status?.fan_percent ?? 0,
    // No authoritative auto/manual flag in /status; fan UI treats mode
    // as write-only intent
    autoFanSpeed: 0,
    fanRpm: 0,
    bestDiff,
    bestSessionDiff: bestDiff,
    sharesAccepted: status?.accepted ?? 0,
    sharesRejected: status?.rejected ?? 0,
    hwErrors:
      typeof status?.hardware_errors === 'number'
        ? status.hardware_errors
        : undefined,
    stratumUser: status?.pool?.user ?? '',
    stratumUrl,
    stratumPort,
    // API doesn't expose the firmware version. The empty string also
    // hard-disables identify via the supportsIdentify guard.
    version: '',
    uptimeSeconds: status?.uptime_s ?? 0,
    realtimeHashrate: realtimeGh,
    lastSeen: Date.now(),
    isOnline: true,
    kboxPowerMode:
      typeof status?.power_mode === 'string' ? status.power_mode : undefined,
    kboxDualMining:
      typeof status?.dual_mining === 'boolean' ? status.dual_mining : undefined,
    kboxLed,
    kboxAuthError: authError,
  };
}

/**
 * Interpret an ApiError as a KBox auth failure, if it is one.
 */
export function authErrorFromCode(code?: string): KBoxAuthError | undefined {
  if (code === 'unauthorized') return 'unauthorized';
  if (code === 'api_disabled') return 'api_disabled';
  return undefined;
}
