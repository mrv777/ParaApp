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
  /** Exact accepted-share work for the current round, when provided by the API. */
  workSinceLastBlock?: number | null;
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
  /** Whether the top-diff address has claimed/registered (shows a check on the site) */
  claimed?: boolean;
}

/**
 * Round summary from /api/rounds — one entry per solved block.
 */
export interface RoundSummary {
  block_height: number;
  block_hash: string | null;
  coinbase_value: number | null;
  /** Difficulty of the share that solved the block */
  winner_diff: number | null;
  winner_username: string | null;
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
 * Round work leaderboard entry from /api/rounds/current?type=work
 * (round-scoped only — the all-time /api/leaderboard has no work data).
 * `address` arrives server-truncated ("abcd...wxyz").
 */
export interface RoundWorkLeaderboardEntry {
  rank: number;
  address: string;
  claimed?: boolean;
  top_diff: number;
  blocks_participated: number;
  total_work: number;
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

/** Mining overview returned by mempool.space's hashrate endpoint. */
export interface MiningHashrateResponse {
  currentDifficulty: number;
}
