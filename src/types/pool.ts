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
 * Historical data point for charts
 */
export interface PoolHistoricalPoint {
  timestamp: number;
  hashrate: number;
}

/**
 * Leaderboard entry for top difficulty or loyalty
 */
export interface LeaderboardEntry {
  address: string;
  difficulty: number;
  rank: number;
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
