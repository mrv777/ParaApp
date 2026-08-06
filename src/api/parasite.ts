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
  LeaderboardEntry,
  RoundSummary,
  RoundWorkLeaderboardEntry,
  UserStats,
  UserStatsApiResponse,
  UserWorkerApiResponse,
  UserWorker,
  UserHistoricalPoint,
  UserHistoricalPointApiResponse,
  UserDifficultyHit,
  UserDifficultyHitApiResponse,
  UserRoundsResponse,
  BadgesPayload,
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
function transformHistoricalPoint(raw: UserHistoricalPointApiResponse): UserHistoricalPoint {
  return {
    timestamp: new Date(raw.timestamp).getTime(),
    hashrate: raw.hashrate,
  };
}

function transformDifficultyHit(raw: UserDifficultyHitApiResponse): UserDifficultyHit | null {
  if (
    !Number.isInteger(raw.block_height) ||
    raw.block_height <= 0 ||
    !Number.isFinite(raw.difficulty) ||
    raw.difficulty <= 0 ||
    !Number.isFinite(raw.block_timestamp) ||
    (raw.block_timestamp ?? 0) <= 0
  ) {
    return null;
  }

  return {
    blockHeight: raw.block_height,
    difficulty: raw.difficulty,
    timestamp: raw.block_timestamp! * 1000,
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
  return fetchWithTimeout<PoolHistoricalPoint[]>(`${BASE_URL}/api/pool-stats/historical?${params}`);
}

/**
 * Get account data by Bitcoin address
 * @param address - Bitcoin address
 */
export async function getAccount(address: string): Promise<ApiResult<Account | null>> {
  const result = await fetchWithTimeout<AccountApiResponse>(`${BASE_URL}/api/account/${address}`);

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
  const result = await fetchWithTimeout<UserStatsApiResponse>(`${BASE_URL}/api/user/${address}`);

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
 * Get the user's best difficulty for recent Bitcoin blocks.
 * The upstream endpoint retains and returns at most 500 blocks.
 */
export async function getUserDifficultyHits(
  address: string,
  limit: number = 500
): Promise<ApiResult<UserDifficultyHit[]>> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit) || 1, 1), 500);
  const params = new URLSearchParams({
    address,
    type: 'user-diffs',
    limit: safeLimit.toString(),
  });
  const result = await fetchWithTimeout<UserDifficultyHitApiResponse[]>(
    `${BASE_URL}/api/highest-diff?${params}`
  );

  if (result.success && Array.isArray(result.data)) {
    const hits: UserDifficultyHit[] = [];
    for (const raw of result.data) {
      const hit = transformDifficultyHit(raw);
      if (hit) hits.push(hit);
    }
    return { success: true, data: hits };
  }
  if (result.success) {
    return {
      success: false,
      error: { message: 'Invalid difficulty history response' },
    };
  }
  return result as ApiResult<UserDifficultyHit[]>;
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
  return fetchWithTimeout<DifficultyLeaderboardEntry[]>(`${BASE_URL}/api/leaderboard?${params}`);
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
  return fetchWithTimeout<LoyaltyLeaderboardEntry[]>(`${BASE_URL}/api/leaderboard?${params}`);
}

/**
 * Get the current-round total-work leaderboard.
 * Round-scoped only — the all-time /api/leaderboard has no work data.
 * @param limit - Number of entries to return (default: 420, API max: 999)
 */
export async function getRoundWorkLeaderboard(
  limit: number = 420
): Promise<ApiResult<RoundWorkLeaderboardEntry[]>> {
  const params = new URLSearchParams({ type: 'work', limit: limit.toString() });
  return fetchWithTimeout<RoundWorkLeaderboardEntry[]>(`${BASE_URL}/api/rounds/current?${params}`);
}

/**
 * Get recent blocks with the highest difficulty share submitted by a pool user
 * for each block (powers the per-block top-diff feed on the pool page).
 * @param limit - Number of blocks to return (default: 25)
 */
export async function getHighestDiffBlocks(
  limit: number = 25
): Promise<ApiResult<LeaderboardEntry[]>> {
  const params = new URLSearchParams({ limit: limit.toString() });
  return fetchWithTimeout<LeaderboardEntry[]>(`${BASE_URL}/api/highest-diff?${params}`);
}

/**
 * Get solved-round summaries (one entry per block found by the pool).
 * Filters out the API's placeholder entry (block_height 0, null fields)
 * and any round without a winner_diff.
 */
export async function getRounds(): Promise<ApiResult<RoundSummary[]>> {
  const result = await fetchWithTimeout<RoundSummary[]>(`${BASE_URL}/api/rounds`);
  if (result.success) {
    return {
      success: true,
      data: result.data.filter((r) => r.block_height > 0 && r.winner_diff != null),
    };
  }
  return result;
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
  return fetchWithTimeout<UserRoundsResponse>(`${BASE_URL}/api/user/${address}/rounds?${params}`);
}

/**
 * Get the user's canonical badge payload (server-computed, ~60s server cache).
 * 404 (no badges) and 403 (private profile) are well-defined "nothing to show"
 * states, mapped to success with `null` so callers can hide badge UI cleanly.
 * @param address - Bitcoin address
 */
export async function getUserBadges(address: string): Promise<ApiResult<BadgesPayload | null>> {
  const result = await fetchWithTimeout<BadgesPayload>(
    `${BASE_URL}/api/user/${encodeURIComponent(address)}/badges`
  );
  if (result.success) {
    return result;
  }
  if (result.error.status === 404 || result.error.status === 403) {
    return { success: true, data: null };
  }
  return result;
}
