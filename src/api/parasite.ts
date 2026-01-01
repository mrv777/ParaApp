/**
 * Parasite Pool API client
 * Base URL: https://parasite.space
 */

import type {
  ApiResult,
  PoolStats,
  PoolHistoricalPoint,
  LeaderboardEntry,
  UserStats,
  UserHistoricalPoint,
  HistoricalPeriod,
  HistoricalInterval,
} from '@/types';
import { fetchWithTimeout, patchJson } from './client';

const BASE_URL = 'https://parasite.space';

/**
 * Get pool-wide statistics
 */
export async function getPoolStats(): Promise<ApiResult<PoolStats>> {
  return fetchWithTimeout<PoolStats>(`${BASE_URL}/api/pool-stats`);
}

/**
 * Get historical pool statistics
 * @param period - Time period (1h, 24h, 7d, 30d)
 * @param interval - Data granularity (5m, 15m, 1h, 4h, 1d)
 */
export async function getPoolHistorical(
  period: HistoricalPeriod,
  interval: HistoricalInterval
): Promise<ApiResult<PoolHistoricalPoint[]>> {
  const params = new URLSearchParams({ period, interval });
  return fetchWithTimeout<PoolHistoricalPoint[]>(
    `${BASE_URL}/api/pool-stats/historical?${params}`
  );
}

/**
 * Get user data by Bitcoin address
 * @param address - Bitcoin address
 */
export async function getUser(address: string): Promise<ApiResult<UserStats>> {
  return fetchWithTimeout<UserStats>(`${BASE_URL}/api/user/${address}`);
}

/**
 * Get historical user statistics
 * @param address - Bitcoin address
 * @param period - Time period (1h, 24h, 7d, 30d)
 * @param interval - Data granularity (5m, 15m, 1h, 4h, 1d)
 */
export async function getUserHistorical(
  address: string,
  period: HistoricalPeriod,
  interval: HistoricalInterval
): Promise<ApiResult<UserHistoricalPoint[]>> {
  const params = new URLSearchParams({ period, interval });
  return fetchWithTimeout<UserHistoricalPoint[]>(
    `${BASE_URL}/api/user/${address}/historical?${params}`
  );
}

/**
 * Toggle user visibility on leaderboards
 * @param address - Bitcoin address
 */
export async function toggleUserVisibility(
  address: string
): Promise<ApiResult<{ isPublic: boolean }>> {
  return patchJson<{ isPublic: boolean }>(`${BASE_URL}/api/user/${address}`, {});
}

/**
 * Get top difficulty leaderboard
 * @param limit - Number of entries to return (default: 50)
 */
export async function getLeaderboard(
  limit: number = 50
): Promise<ApiResult<LeaderboardEntry[]>> {
  const params = new URLSearchParams({ limit: limit.toString() });
  return fetchWithTimeout<LeaderboardEntry[]>(
    `${BASE_URL}/api/highest-diff?${params}`
  );
}

/**
 * Get user's block difficulties
 * @param address - Bitcoin address
 * @param limit - Number of entries to return (default: 50)
 */
export async function getUserDiffs(
  address: string,
  limit: number = 50
): Promise<ApiResult<LeaderboardEntry[]>> {
  const params = new URLSearchParams({
    address,
    type: 'user-diffs',
    limit: limit.toString(),
  });
  return fetchWithTimeout<LeaderboardEntry[]>(
    `${BASE_URL}/api/highest-diff?${params}`
  );
}
