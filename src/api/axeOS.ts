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
    payload.autofanspeed = settings.autoFanSpeed;
  }
  if (settings.fanSpeed !== undefined) {
    payload.fanspeed = settings.fanSpeed;
  }
  if (settings.targetTemp !== undefined) {
    payload.temptarget = settings.targetTemp;
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
    retries: 0, // non-idempotent write — don't re-send on transient failure
  });
}

/**
 * Update Hammer miner settings.
 * Hammer firmware requires the full settings object in every PATCH —
 * partial updates are silently ignored. Frequency/voltage/boot_mode
 * changes only take effect after a restart.
 *
 * We GET the device's current config first so the unchanged fields in the
 * full payload reflect the live device state, not a possibly-stale poll
 * snapshot (which would revert any change made on the device since the last
 * poll) and so optional fields aren't fabricated from hardcoded defaults.
 * If the GET fails we fall back to the last snapshot (miner.rawConfig / miner
 * fields), i.e. the prior behavior.
 */
export async function updateHammerSettings(
  ip: string,
  settings: MinerSettings,
  miner: LocalMiner
): Promise<ApiResult<void>> {
  const freshResult = await getSystemInfo(ip);
  const fresh = freshResult.success ? freshResult.data : undefined;
  const raw = miner.rawConfig;

  // Build full payload. Precedence per field: explicit change → fresh device
  // value → last poll snapshot → safe hardcoded default. `??` preserves a
  // legitimate 0 (only null/undefined fall through).
  const payload: Record<string, unknown> = {
    frequency: settings.frequency ?? fresh?.frequency ?? miner.frequency,
    coreVoltage: settings.coreVoltage ?? fresh?.coreVoltage ?? miner.voltage,
    fanspeed: settings.fanSpeed ?? fresh?.fanspeed ?? miner.fanSpeed,
    autofanspeed:
      settings.autoFanSpeed ?? fresh?.autofanspeed ?? miner.autoFanSpeed,
    flipscreen: fresh?.flipscreen ?? raw?.flipscreen ?? 1,
    invertfanpolarity:
      fresh?.invertfanpolarity ?? raw?.invertfanpolarity ?? 0,
    overheat_mode: fresh?.overheat_mode ?? raw?.overheat_mode ?? 0,
    boot_mode: fresh?.boot_mode ?? miner.bootMode ?? 0,
    ntpServer: fresh?.ntpServer ?? raw?.ntpServer ?? 'pool.ntp.org',
    ntpServerBackup:
      fresh?.ntpServerBackup ?? raw?.ntpServerBackup ?? 'ntp.aliyun.com',
  };

  // targetTemp only included when device exposes it (firmware support varies)
  const effectiveTargetTemp =
    settings.targetTemp ?? fresh?.temptarget ?? miner.targetTemp;
  if (effectiveTargetTemp !== undefined) {
    payload.temptarget = effectiveTargetTemp;
  }

  // If frequency or voltage is being changed, set boot_mode to customize (2)
  if (settings.frequency !== undefined || settings.coreVoltage !== undefined) {
    payload.boot_mode = 2;
  }

  const result = await patchJson<void>(`${minerUrl(ip)}/api/system`, payload, {
    timeout: MINER_TIMEOUT,
    responseType: 'text',
    retries: 0, // non-idempotent write — don't re-send on transient failure
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
    // TODO(needs-device): This pool PATCH sends only the changed pool fields,
    // which contradicts the "full settings object in every PATCH" note above.
    // If Hammer really ignores partial PATCHes, pool changes are silently
    // dropped here — confirm on hardware before folding these into the full
    // payload above.
    return patchJson<void>(`${minerUrl(ip)}/api/system`, poolPayload, {
      timeout: MINER_TIMEOUT,
      responseType: 'text',
      retries: 0, // non-idempotent write — don't re-send on transient failure
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
    retries: 0, // non-idempotent — a retry flashes the LED again
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
