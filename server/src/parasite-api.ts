/**
 * Parasite Pool API client for Cloudflare Workers
 */

import type {
  ParasiteUserResponse,
  ParasitePoolStatsResponse,
  DispenserEligibilityResponse,
  DispenserTier,
} from './types';

const DEFAULT_TIMEOUT = 10000; // 10 seconds

interface FetchResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  /** HTTP status of a non-ok response; callers use it to tell 404 from outage */
  status?: number;
}

/**
 * Fetch with timeout for Cloudflare Workers
 */
async function fetchWithTimeout<T>(
  url: string,
  timeoutMs: number = DEFAULT_TIMEOUT
): Promise<FetchResult<T>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        status: response.status,
      };
    }

    const data = (await response.json()) as T;
    return { success: true, data };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return { success: false, error: 'Request timeout' };
      }
      return { success: false, error: error.message };
    }

    return { success: false, error: 'Unknown error' };
  }
}

/**
 * Get user stats from Parasite Pool
 * Returns worker data, best difficulty, etc.
 */
export async function getUser(
  baseUrl: string,
  address: string,
  timeoutMs: number = DEFAULT_TIMEOUT
): Promise<FetchResult<ParasiteUserResponse>> {
  return fetchWithTimeout<ParasiteUserResponse>(
    `${baseUrl}/api/user/${encodeURIComponent(address)}`,
    timeoutMs
  );
}

/**
 * Get dispenser eligibility for an address. 404 (surfaced via `status`) means
 * the dispenser has never seen the address — a well-defined "zero slots" state,
 * distinct from an outage.
 */
export async function getDispenserEligibility(
  baseUrl: string,
  address: string,
  timeoutMs: number = DEFAULT_TIMEOUT
): Promise<FetchResult<DispenserEligibilityResponse>> {
  return fetchWithTimeout<DispenserEligibilityResponse>(
    `${baseUrl}/api/dispenser/eligibility/${encodeURIComponent(address)}`,
    timeoutMs
  );
}

/**
 * Get dispenser tier definitions (tier name → asset), used to name the asset
 * in reward notifications.
 */
export async function getDispenserTiers(
  baseUrl: string
): Promise<FetchResult<DispenserTier[]>> {
  return fetchWithTimeout<DispenserTier[]>(`${baseUrl}/api/dispenser/tiers`);
}

/**
 * Get pool-wide stats from Parasite Pool
 * Used for block detection via lastBlockTime
 */
export async function getPoolStats(
  baseUrl: string
): Promise<FetchResult<ParasitePoolStatsResponse>> {
  return fetchWithTimeout<ParasitePoolStatsResponse>(
    `${baseUrl}/api/pool-stats`
  );
}
