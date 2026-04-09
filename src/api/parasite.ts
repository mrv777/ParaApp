/**
 * Parasite Pool API client
 * Base URL: https://parasite.space
 */

import type {
  ApiResult,
  PoolStats,
  PoolHistoricalPoint,
  DifficultyLeaderboardEntry,
  LoyaltyLeaderboardEntry,
  UserStats,
  UserStatsApiResponse,
  UserWorkerApiResponse,
  UserWorker,
  UserHistoricalPoint,
  UserHistoricalPointApiResponse,
  UserRoundsResponse,
  Account,
  AccountApiResponse,
  HistoricalPeriod,
  HistoricalInterval,
  WorkerStatus,
} from '@/types';
import { WORKER_STALE_THRESHOLD_MS } from '@/constants';
import { parseDifficulty } from '@/utils/formatting';
import { fetchWithTimeout } from './client';

const BASE_URL = 'https://parasite.space';

// ============================================
// Transformation Helpers
// ============================================

/**
 * Determine worker status based on hashrate and last submission time
 */
function getWorkerStatus(hashrate: number, lastSubmission: number): WorkerStatus {
  if (hashrate <= 0) {
    return 'offline';
  }

  const now = Date.now();
  const timeSinceLastShare = now - lastSubmission;

  // Handle clock skew (future timestamp) - treat as online
  if (timeSinceLastShare < 0) {
    return 'online';
  }

  if (timeSinceLastShare > WORKER_STALE_THRESHOLD_MS) {
    return 'stale';
  }

  return 'online';
}

/**
 * Transform raw worker API response to app format
 */
function transformWorker(raw: UserWorkerApiResponse): UserWorker {
  const hashrate = parseFloat(raw.hashrate) || 0;
  // API returns Unix timestamp in seconds, convert to milliseconds
  const lastSubmissionSeconds = parseInt(raw.lastSubmission, 10) || 0;
  const lastSubmissionMs = lastSubmissionSeconds * 1000;
  return {
    id: raw.id,
    name: raw.name,
    hashrate,
    bestDifficulty: parseFloat(raw.bestDifficulty) || 0,
    lastSubmission: lastSubmissionMs,
    status: getWorkerStatus(hashrate, lastSubmissionMs),
  };
}

/**
 * Transform raw user stats API response to app format
 */
function transformUserStats(raw: UserStatsApiResponse): UserStats {
  return {
    hashrate: raw.hashrate,
    workerCount: raw.workers,
    workers: (raw.workerData || []).map(transformWorker),
    bestDifficulty: parseDifficulty(raw.bestDifficulty),
    bestDifficultyFormatted: raw.bestDifficulty,
    lastSubmission: raw.lastSubmission,
    uptime: raw.uptime,
    // hashrate1h and hashrate24h will be computed from historical data
  };
}

/**
 * Transform raw account API response to app format
 */
function transformAccount(raw: AccountApiResponse): Account | null {
  if (!raw.account) return null;

  return {
    btcAddress: raw.account.btc_address,
    lnAddress: raw.account.ln_address,
    totalDiff: raw.account.total_diff,
    lastUpdated: raw.account.last_updated,
    blockCount: raw.account.metadata?.block_count ?? 0,
    highestBlockHeight: raw.account.metadata?.highest_blockheight ?? 0,
    isPrivate: raw.account.metadata?.is_private,
  };
}

/**
 * Transform raw historical point to app format
 */
function transformHistoricalPoint(
  raw: UserHistoricalPointApiResponse
): UserHistoricalPoint {
  return {
    timestamp: new Date(raw.timestamp).getTime(),
    hashrate: raw.hashrate,
  };
}

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
 * Get account data by Bitcoin address
 * @param address - Bitcoin address
 */
export async function getAccount(address: string): Promise<ApiResult<Account | null>> {
  const result = await fetchWithTimeout<AccountApiResponse>(
    `${BASE_URL}/api/account/${address}`
  );

  if (result.success && result.data) {
    return { success: true, data: transformAccount(result.data) };
  }
  return result as ApiResult<Account | null>;
}

/**
 * Get user data by Bitcoin address
 * @param address - Bitcoin address
 */
export async function getUser(address: string): Promise<ApiResult<UserStats>> {
  const result = await fetchWithTimeout<UserStatsApiResponse>(
    `${BASE_URL}/api/user/${address}`
  );

  if (result.success && result.data) {
    return { success: true, data: transformUserStats(result.data) };
  }
  return result as ApiResult<UserStats>;
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
  const result = await fetchWithTimeout<UserHistoricalPointApiResponse[]>(
    `${BASE_URL}/api/user/${address}/historical?${params}`
  );

  if (result.success && result.data) {
    return { success: true, data: result.data.map(transformHistoricalPoint) };
  }
  return result as ApiResult<UserHistoricalPoint[]>;
}

/**
 * Get difficulty leaderboard
 * @param limit - Number of entries to return (default: 420)
 * @param round - Optional round scope ('current' for since last block)
 */
export async function getDifficultyLeaderboard(
  limit: number = 420,
  round?: 'current'
): Promise<ApiResult<DifficultyLeaderboardEntry[]>> {
  const params = new URLSearchParams({
    type: 'difficulty',
    limit: limit.toString(),
  });
  if (round) params.set('round', round);
  return fetchWithTimeout<DifficultyLeaderboardEntry[]>(
    `${BASE_URL}/api/leaderboard?${params}`
  );
}

/**
 * Get loyalty leaderboard
 * @param limit - Number of entries to return (default: 420)
 * @param round - Optional round scope ('current' for since last block)
 */
export async function getLoyaltyLeaderboard(
  limit: number = 420,
  round?: 'current'
): Promise<ApiResult<LoyaltyLeaderboardEntry[]>> {
  const params = new URLSearchParams({
    type: 'loyalty',
    limit: limit.toString(),
  });
  if (round) params.set('round', round);
  return fetchWithTimeout<LoyaltyLeaderboardEntry[]>(
    `${BASE_URL}/api/leaderboard?${params}`
  );
}

/**
 * Get user round participation history
 * @param address - Bitcoin address
 * @param limit - Max rounds to return (default: 100, API max: 100)
 */
export async function getUserRounds(
  address: string,
  limit: number = 100
): Promise<ApiResult<UserRoundsResponse>> {
  const params = new URLSearchParams({ limit: limit.toString() });
  return fetchWithTimeout<UserRoundsResponse>(
    `${BASE_URL}/api/user/${address}/rounds?${params}`
  );
}
