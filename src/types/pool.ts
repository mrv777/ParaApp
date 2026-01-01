/**
 * Parasite Pool data types
 */

/**
 * Pool-wide statistics from /api/pool-stats
 */
export interface PoolStats {
  uptime: string;
  lastBlockTime: string;
  highestDifficulty: string;
  hashrate: number;
  users: number;
  workers: number;
}

/**
 * Block found by the pool
 */
export interface PoolBlock {
  block_height: number;
  /** Finder address (truncated for privacy) */
  top_diff_address: string;
  difficulty: number;
  block_timestamp: number | null;
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
  top_diff_address: string;
  difficulty: number;
  block_timestamp: number;
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
