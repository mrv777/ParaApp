/**
 * AxeOS Miner local API client
 * Base URL: http://{miner_ip}
 */

import type { ApiResult, AsicConfig, AxeOSSystemInfo, LocalMiner, MinerSettings } from '@/types';
import { fetchWithTimeout, postJson, postText, patchJson, MINER_TIMEOUT } from './client';

/**
 * Build base URL for a miner
 */
function minerUrl(ip: string): string {
  return `http://${ip}`;
}

/**
 * Get full device status and stats
 * @param ip - Miner IP address
 */
export async function getSystemInfo(
  ip: string
): Promise<ApiResult<AxeOSSystemInfo>> {
  return fetchWithTimeout<AxeOSSystemInfo>(
    `${minerUrl(ip)}/api/system/info`,
    { timeout: MINER_TIMEOUT, retries: 0 }
  );
}

/**
 * Get ASIC-specific settings and options
 * @param ip - Miner IP address
 */
export async function getAsicSettings(
  ip: string
): Promise<ApiResult<AsicConfig>> {
  return fetchWithTimeout<AsicConfig>(
    `${minerUrl(ip)}/api/system/asic`,
    { timeout: MINER_TIMEOUT, retries: 0 }
  );
}

/**
 * Update device settings
 * @param ip - Miner IP address
 * @param settings - Settings to update
 */
export async function updateSettings(
  ip: string,
  settings: MinerSettings
): Promise<ApiResult<void>> {
  // Map our settings interface to AxeOS API format
  const payload: Record<string, unknown> = {};

  if (settings.frequency !== undefined) {
    payload.frequency = settings.frequency;
  }
  if (settings.coreVoltage !== undefined) {
    payload.coreVoltage = settings.coreVoltage;
  }
  if (settings.autoFanSpeed !== undefined) {
    payload.autofanspeed = settings.autoFanSpeed ? 1 : 0;
  }
  if (settings.fanSpeed !== undefined) {
    payload.fanspeed = settings.fanSpeed;
  }
  if (settings.stratumUrl !== undefined) {
    payload.stratumURL = settings.stratumUrl;
  }
  if (settings.stratumPort !== undefined) {
    payload.stratumPort = settings.stratumPort;
  }
  if (settings.stratumUser !== undefined) {
    payload.stratumUser = settings.stratumUser;
  }
  if (settings.stratumPassword !== undefined) {
    payload.stratumPassword = settings.stratumPassword;
  }
  if (settings.fallbackStratumUrl !== undefined) {
    payload.fallbackStratumURL = settings.fallbackStratumUrl;
  }
  if (settings.fallbackStratumPort !== undefined) {
    payload.fallbackStratumPort = settings.fallbackStratumPort;
  }
  if (settings.fallbackStratumUser !== undefined) {
    payload.fallbackStratumUser = settings.fallbackStratumUser;
  }

  return patchJson<void>(`${minerUrl(ip)}/api/system`, payload, {
    timeout: MINER_TIMEOUT,
    responseType: 'text', // Some miners (Hammer) return empty body on success
  });
}

/**
 * Update Hammer miner settings.
 * Hammer firmware requires the full settings object in every PATCH —
 * partial updates are silently ignored. Frequency/voltage/boot_mode
 * changes only take effect after a restart.
 */
export async function updateHammerSettings(
  ip: string,
  settings: MinerSettings,
  miner: LocalMiner
): Promise<ApiResult<void>> {
  const raw = miner.rawConfig;

  // Build full payload with current values as defaults
  const payload: Record<string, unknown> = {
    frequency: settings.frequency ?? miner.frequency,
    coreVoltage: settings.coreVoltage ?? miner.voltage,
    fanspeed: settings.fanSpeed ?? miner.fanSpeed,
    autofanspeed: (settings.autoFanSpeed ?? miner.autoFanSpeed) ? 1 : 0,
    flipscreen: raw?.flipscreen ?? 1,
    invertfanpolarity: raw?.invertfanpolarity ?? 0,
    overheat_mode: raw?.overheat_mode ?? 0,
    boot_mode: miner.bootMode ?? 0,
    ntpServer: raw?.ntpServer ?? 'pool.ntp.org',
    ntpServerBackup: raw?.ntpServerBackup ?? 'ntp.aliyun.com',
  };

  // If frequency or voltage is being changed, set boot_mode to customize (2)
  if (settings.frequency !== undefined || settings.coreVoltage !== undefined) {
    payload.boot_mode = 2;
  }

  const result = await patchJson<void>(`${minerUrl(ip)}/api/system`, payload, {
    timeout: MINER_TIMEOUT,
    responseType: 'text',
  });

  if (!result.success) return result;

  // Pool settings are a separate PATCH on Hammer
  const poolPayload: Record<string, unknown> = {};
  let hasPoolChanges = false;

  if (settings.stratumUrl !== undefined) {
    poolPayload.stratumURL = settings.stratumUrl;
    hasPoolChanges = true;
  }
  if (settings.stratumPort !== undefined) {
    poolPayload.stratumPort = settings.stratumPort;
    hasPoolChanges = true;
  }
  if (settings.stratumUser !== undefined) {
    poolPayload.stratumUser = settings.stratumUser;
    hasPoolChanges = true;
  }
  if (settings.stratumPassword !== undefined) {
    poolPayload.stratumPassword = settings.stratumPassword;
    hasPoolChanges = true;
  }
  if (settings.fallbackStratumUrl !== undefined) {
    poolPayload.fallbackStratumURL = settings.fallbackStratumUrl;
    hasPoolChanges = true;
  }
  if (settings.fallbackStratumPort !== undefined) {
    poolPayload.fallbackStratumPort = settings.fallbackStratumPort;
    hasPoolChanges = true;
  }
  if (settings.fallbackStratumUser !== undefined) {
    poolPayload.fallbackStratumUser = settings.fallbackStratumUser;
    hasPoolChanges = true;
  }

  if (hasPoolChanges) {
    return patchJson<void>(`${minerUrl(ip)}/api/system`, poolPayload, {
      timeout: MINER_TIMEOUT,
      responseType: 'text',
    });
  }

  return result;
}

/**
 * Restart/reboot the miner
 * Note: The miner reboots immediately, often dropping the connection
 * before returning a response. We treat network errors as success
 * since the command was sent and the miner is rebooting.
 * @param ip - Miner IP address
 */
export async function restart(ip: string): Promise<ApiResult<void>> {
  const result = await postJson<void>(`${minerUrl(ip)}/api/system/restart`, {}, {
    timeout: MINER_TIMEOUT,
    retries: 0, // Don't retry - miner is rebooting
  });

  // If we got a network error or timeout, the miner likely rebooted
  // before it could respond - treat this as success
  if (!result.success) {
    const errorCode = result.error.code;
    if (errorCode === 'NETWORK_ERROR' || errorCode === 'TIMEOUT') {
      return { success: true, data: undefined };
    }
  }

  return result;
}

/**
 * Flash LED/display to identify the miner
 * Note: Returns plain text response, not JSON.
 * Requires ESP-Miner v2.12.0+
 * @param ip - Miner IP address
 */
export async function identify(ip: string): Promise<ApiResult<string>> {
  return postText(`${minerUrl(ip)}/api/system/identify`, {}, {
    timeout: MINER_TIMEOUT,
  });
}

/**
 * Parasite Pool stratum preset settings
 */
export const PARASITE_STRATUM_PRESET: Pick<
  MinerSettings,
  'stratumUrl' | 'stratumPort'
> = {
  stratumUrl: 'stratum.parasite.space',
  stratumPort: 3333,
};

/**
 * Apply Parasite Pool preset to a miner
 * @param ip - Miner IP address
 * @param stratumUser - Worker name (typically Bitcoin address)
 */
export async function applyParasitePreset(
  ip: string,
  stratumUser: string
): Promise<ApiResult<void>> {
  return updateSettings(ip, {
    ...PARASITE_STRATUM_PRESET,
    stratumUser,
    stratumPassword: 'x',
  });
}
