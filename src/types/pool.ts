/**
 * Parasite Pool data types
 */

/**
 * Pool-wide statistics from /api/pool-stats
 */
export interface PoolStats {
  uptime: string;
  /** Block height of last found block (e.g., "938713"), or null */
  lastBlockTime: string | null;
  /** Hash of last found block, or null */
  lastBlockHash: string | null;
  highestDifficulty: string;
  hashrate: number;
  users: number;
  workers: number;
}

/**
 * Historical data point for charts from /api/pool-stats/historical
 */
export interface PoolHistoricalPoint {
  timestamp: number;
  users: number;
  workers: number;
  idle: number;
  disconnected: number;
  hashrate15m: number;
  hashrate1hr: number;
  hashrate6hr: number;
  hashrate1d: number;
  hashrate7d: number;
}

/**
 * Leaderboard entry from /api/highest-diff
 */
export interface LeaderboardEntry {
  block_height: number;
  top_diff_address: string | null;
  difficulty: number | null;
  block_timestamp: number;
}

/**
 * Leaderboard type for new API
 */
export type LeaderboardType = 'difficulty' | 'loyalty';

/**
 * Difficulty leaderboard entry from /api/leaderboard?type=difficulty
 */
export interface DifficultyLeaderboardEntry {
  id: number;
  address: string;
  claimed?: boolean;
  diff: number;
}

/**
 * Loyalty leaderboard entry from /api/leaderboard?type=loyalty
 */
export interface LoyaltyLeaderboardEntry {
  id: number;
  address: string;
  claimed?: boolean;
  total_blocks: number;
}

/**
 * Bitcoin price data from mempool.space
 */
export interface BitcoinPrices {
  USD: number;
  EUR: number;
  GBP: number;
  CAD: number;
  CHF: number;
  AUD: number;
  JPY: number;
}
