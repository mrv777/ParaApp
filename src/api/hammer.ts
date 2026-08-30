/**
 * Hammer v3 firmware local API client (the `/v2/*` REST API).
 * Base URL: http://{miner_ip}
 *
 * Firmware 3.x replaced the legacy AxeOS-style `/api/system/*` surface with
 * a `/v2/*` REST API. Every read is wrapped in an `{ ok, data }` envelope.
 * Legacy Hammers (firmware 2.x) still speak the AxeOS API and go through
 * `src/api/axeOS.ts`; the store picks the client per `hammerApiVersion`.
 */

import type {
  ApiResult,
  HammerV2DeviceInfo,
  HammerV2DeviceStatus,
  HammerV2Envelope,
  HammerV2MinerConfig,
  HammerV2MinerStatus,
  HammerV2NetworkConfig,
  LocalMiner,
  MinerSettings,
} from '@/types';
import {
  fetchWithTimeout,
  isSuccess,
  postJson,
  MINER_TIMEOUT,
} from './client';
import { MAX_REMOTE_ITEMS } from '@/utils/finiteNumbers';

function minerUrl(ip: string): string {
  return `http://${ip}`;
}

/**
 * GET a `/v2` endpoint and unwrap its `{ ok, data }` envelope. An `ok:false`
 * body (or a missing `data`) is surfaced as a failure so callers don't parse
 * a half-response.
 */
async function getEnvelope<T>(
  url: string,
  signal?: AbortSignal
): Promise<ApiResult<T>> {
  const result = await fetchWithTimeout<HammerV2Envelope<T>>(url, {
    timeout: MINER_TIMEOUT,
    retries: 0,
    ...(signal ? { signal } : {}),
  });
  if (!isSuccess(result)) return result;
  if (!result.data || result.data.ok !== true || result.data.data == null) {
    return {
      success: false,
      error: { message: 'Hammer v2 responded not-ok', code: 'HAMMER_NOT_OK' },
    };
  }
  return { success: true, data: result.data.data };
}

/**
 * Discovery/type probe: is this IP a Hammer running v3 firmware?
 * `/v2/device/info` returns a device identity envelope; a legacy Hammer 404s.
 */
export async function isHammerV2(
  ip: string,
  signal?: AbortSignal
): Promise<boolean> {
  const result = await getEnvelope<HammerV2DeviceInfo>(
    `${minerUrl(ip)}/v2/device/info`,
    signal
  );
  return isSuccess(result) && !!result.data.device_model;
}

/** The pieces of a v2 monitoring snapshot; only `minerStatus` is required. */
export interface HammerV2Snapshot {
  minerStatus: HammerV2MinerStatus;
  deviceInfo?: HammerV2DeviceInfo;
  deviceStatus?: HammerV2DeviceStatus;
  networkConfig?: HammerV2NetworkConfig;
}

/**
 * Fetch the monitoring snapshot in parallel. All four endpoints are fast on a
 * LAN (25-90 ms); the slow ones (`/v2/network/wifi/list`, `/v2/logs/*`) are
 * deliberately excluded from polling. `miner/status` is required — the rest
 * enrich and degrade gracefully if a single call fails.
 */
export async function getSnapshot(
  ip: string
): Promise<ApiResult<HammerV2Snapshot>> {
  const [minerStatus, deviceInfo, deviceStatus, networkConfig] =
    await Promise.all([
      getEnvelope<HammerV2MinerStatus>(`${minerUrl(ip)}/v2/miner/status`),
      getEnvelope<HammerV2DeviceInfo>(`${minerUrl(ip)}/v2/device/info`),
      getEnvelope<HammerV2DeviceStatus>(`${minerUrl(ip)}/v2/device/status`),
      getEnvelope<HammerV2NetworkConfig>(`${minerUrl(ip)}/v2/network/config`),
    ]);

  if (!isSuccess(minerStatus)) return minerStatus;

  return {
    success: true,
    data: {
      minerStatus: minerStatus.data,
      deviceInfo: isSuccess(deviceInfo) ? deviceInfo.data : undefined,
      deviceStatus: isSuccess(deviceStatus) ? deviceStatus.data : undefined,
      networkConfig: isSuccess(networkConfig) ? networkConfig.data : undefined,
    },
  };
}

/** Map raw Hammer device model codes to display names */
function getHammerModelDisplay(rawModel: string): string {
  const displayNames: Record<string, string> = {
    BC04: 'Hammer BC04',
  };
  return displayNames[rawModel] || rawModel;
}

/** Per-chip expected hashrate (GH/s) by ASIC model — multiplied by chip count */
function getExpectedHashratePerChip(asicModel: string): number {
  const hashrates: Record<string, number> = {
    BM1366: 500,
    BM1368: 650,
    BM1370: 1200,
    BM1397: 400,
  };
  return hashrates[asicModel] || 500;
}

/**
 * Build a LocalMiner from a v2 snapshot. Notable conversions:
 *  - hashrate is H/s on the wire → GH/s in LocalMiner (÷1e9)
 *  - `temp` uses the board sensor; per-chip temps feed the heatmap via asicTemps
 *  - v2 has no auto-fan temp target, so targetTemp stays undefined
 */
export function adaptToLocalMiner(input: {
  ip: string;
  snapshot: HammerV2Snapshot;
}): LocalMiner {
  const { ip, snapshot } = input;
  const s = snapshot.minerStatus;
  const info = snapshot.deviceInfo;
  const dev = snapshot.deviceStatus;
  const net = snapshot.networkConfig;

  const asicModel = info?.chip_type ?? '';
  const chipTemps = Array.isArray(s.chips)
    ? s.chips
        .slice(0, MAX_REMOTE_ITEMS)
        .map((c) => c.temperature)
        .filter(Number.isFinite)
    : undefined;
  // miner/status remains required even when device/info temporarily fails,
  // so preserve an accurate chip count from its chips array before falling
  // back to the single-chip minimum.
  const chipCount =
    info?.detected_chips_count ?? (Array.isArray(s.chips) ? s.chips.length : 1);

  return {
    ip,
    hostname: net?.hostname ?? '',
    ASICModel: asicModel,
    deviceModel: info?.device_model
      ? getHammerModelDisplay(info.device_model)
      : 'Hammer',
    minerType: 'hammer',
    hammerApiVersion: 2,
    expectedHashrate: getExpectedHashratePerChip(asicModel) * chipCount,
    // H/s → GH/s
    hashRate: s.current_hashrate / 1e9,
    power: s.power_consumption,
    temp: s.temp_board,
    voltage: s.coreVoltage,
    frequency: s.frequency,
    fanSpeed: s.fan_target_speed,
    autoFanSpeed: s.fan_mode,
    targetTemp: undefined,
    fanRpm: s.fan_speed_rpm,
    bestDiff: s.bestDiff,
    bestSessionDiff: s.bestSessionDiff,
    sharesAccepted: s.shares_accepted,
    sharesRejected: s.shares_rejected,
    stratumUser: s.pool_worker,
    stratumUrl: s.pool_url,
    stratumPort: s.pool_port,
    version: info?.firmware_version ?? '',
    uptimeSeconds: dev?.uptime_seconds ?? 0,
    wifiSSID: dev?.wifi_ssid,
    rssi: dev?.wifi_rssi,
    overheatMode: s.overheat_mode === 1,
    lastSeen: Date.now(),
    isOnline: true,
    // Hammer-specific
    hwErrors: s.hwNumber,
    hwErrorRate: s.hwRate,
    fallbackStratumUrl: s.fallback_pool_url,
    fallbackStratumPort: s.fallback_pool_port,
    fallbackStratumUser: s.fallback_pool_worker,
    isUsingFallbackStratum: s.isUsingFallbackStratum,
    serialNumber: info?.serial_number,
    bootMode: s.boot_mode,
    macAddress: info?.mac_address,
    // Per-chip data drives the ASIC heatmap (shared with Avalon).
    asicCount: chipCount,
    asicTemps: chipTemps && chipTemps.length > 0 ? chipTemps : undefined,
  };
}

/**
 * Update mining config. v2 accepts a clean PUT of the whole config object, so
 * we GET the current config, merge the changed fields, and PUT it back — no
 * legacy full-payload hack or separate pool PATCH.
 *
 * Frequency/voltage changes force `boot_mode = 2` (customize) and also set the
 * Customize* fields (the values boot_mode 2 actually runs). Those changes only
 * take effect after a reboot — the settings screen restarts the miner.
 *
 * Note: v2 config has no pool-password field, so `settings.stratumPassword`
 * is intentionally ignored here.
 */
export async function updateConfig(
  ip: string,
  settings: MinerSettings
): Promise<ApiResult<void>> {
  const current = await getEnvelope<HammerV2MinerConfig>(
    `${minerUrl(ip)}/v2/miner/config`
  );
  if (!isSuccess(current)) return current;

  const config: HammerV2MinerConfig = { ...current.data };
  const changingHardware =
    settings.frequency !== undefined || settings.coreVoltage !== undefined;

  if (settings.frequency !== undefined) {
    config.core_frequency = settings.frequency;
    config.Customizefrequency = settings.frequency;
  }
  if (settings.coreVoltage !== undefined) {
    config.core_voltage = settings.coreVoltage;
    config.coreCustomizeVoltage = settings.coreVoltage;
  }
  if (changingHardware) {
    config.boot_mode = 2; // customize
  }
  if (settings.fanSpeed !== undefined) {
    config.fan_target_speed = settings.fanSpeed;
  }
  if (settings.autoFanSpeed !== undefined) {
    config.fan_mode = settings.autoFanSpeed;
  }
  if (settings.stratumUrl !== undefined) {
    config.pool_url = settings.stratumUrl;
  }
  if (settings.stratumPort !== undefined) {
    config.pool_port = settings.stratumPort;
  }
  if (settings.stratumUser !== undefined) {
    config.pool_worker = settings.stratumUser;
  }
  if (settings.fallbackStratumUrl !== undefined) {
    config.fallback_pool_url = settings.fallbackStratumUrl;
  }
  if (settings.fallbackStratumPort !== undefined) {
    config.fallback_pool_port = settings.fallbackStratumPort;
  }
  if (settings.fallbackStratumUser !== undefined) {
    config.fallback_pool_worker = settings.fallbackStratumUser;
  }

  return fetchWithTimeout<void>(`${minerUrl(ip)}/v2/miner/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
    timeout: MINER_TIMEOUT,
    responseType: 'text', // firmware may return an empty body on success
    retries: 0, // non-idempotent write — don't re-send on transient failure
  });
}

/**
 * Reboot the device. Like the AxeOS restart, the miner drops the connection
 * before responding, so a network error / timeout is treated as success.
 */
export async function reboot(ip: string): Promise<ApiResult<void>> {
  const result = await postJson<void>(
    `${minerUrl(ip)}/v2/device/reboot`,
    {},
    { timeout: MINER_TIMEOUT, retries: 0, responseType: 'text' }
  );
  if (!isSuccess(result)) {
    const code = result.error.code;
    if (code === 'NETWORK_ERROR' || code === 'TIMEOUT') {
      return { success: true, data: undefined };
    }
  }
  return result;
}

/**
 * Flash the RGB LED to identify the device (v2 only).
 *
 * TODO(needs-device): the `/v2/device/rgb` write body is unverified — the
 * probe only exercised the GET (which 404s on models without an RGB LED).
 * Body shape and effect names may need adjusting against hardware.
 */
export async function identify(ip: string): Promise<ApiResult<void>> {
  return fetchWithTimeout<void>(`${minerUrl(ip)}/v2/device/rgb`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ effect: 'blink', r: 248, g: 4, b: 33 }),
    timeout: MINER_TIMEOUT,
    responseType: 'text',
    retries: 0,
  });
}

/**
 * Start the on-device autotune routine (v2 only).
 *
 * TODO(needs-device): the autotune request body/params are unverified — the
 * probe skipped this mutating endpoint. An empty body is the safe default.
 */
export async function autotune(ip: string): Promise<ApiResult<void>> {
  return postJson<void>(
    `${minerUrl(ip)}/v2/miner/autotune`,
    {},
    { timeout: MINER_TIMEOUT, retries: 0, responseType: 'text' }
  );
}
