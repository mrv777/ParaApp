/**
 * Bitaxe Miner local API client
 * Base URL: http://{miner_ip}
 */

import type { ApiResult, BitaxeSystemInfo, MinerSettings } from '@/types';
import { fetchWithTimeout, postJson, patchJson, MINER_TIMEOUT } from './client';

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
): Promise<ApiResult<BitaxeSystemInfo>> {
  return fetchWithTimeout<BitaxeSystemInfo>(
    `${minerUrl(ip)}/api/system/info`,
    { timeout: MINER_TIMEOUT }
  );
}

/**
 * Get ASIC-specific settings and options
 * @param ip - Miner IP address
 */
export async function getAsicSettings(
  ip: string
): Promise<ApiResult<Record<string, unknown>>> {
  return fetchWithTimeout<Record<string, unknown>>(
    `${minerUrl(ip)}/api/system/asic`,
    { timeout: MINER_TIMEOUT }
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
  // Map our settings interface to Bitaxe API format
  const payload: Record<string, unknown> = {};

  if (settings.frequency !== undefined) {
    payload.frequency = settings.frequency;
  }
  if (settings.coreVoltage !== undefined) {
    payload.coreVoltage = settings.coreVoltage;
  }
  if (settings.fanSpeed !== undefined) {
    // 0 means auto fan
    payload.fanspeed = settings.fanSpeed;
    payload.autofanspeed = settings.fanSpeed === 0 ? 1 : 0;
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

  return patchJson<void>(`${minerUrl(ip)}/api/system`, payload, {
    timeout: MINER_TIMEOUT,
  });
}

/**
 * Restart/reboot the miner
 * @param ip - Miner IP address
 */
export async function restart(ip: string): Promise<ApiResult<void>> {
  return postJson<void>(`${minerUrl(ip)}/api/system/restart`, {}, {
    timeout: MINER_TIMEOUT,
  });
}

/**
 * Flash LED to identify the miner
 * @param ip - Miner IP address
 */
export async function identify(ip: string): Promise<ApiResult<void>> {
  return postJson<void>(`${minerUrl(ip)}/api/system/identify`, {}, {
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
  stratumUrl: 'stratum+tcp://parasite.space',
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
