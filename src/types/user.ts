/**
 * User/Worker data types for Parasite Pool
 */

/**
 * Worker status
 */
export type WorkerStatus = 'online' | 'stale' | 'offline';

/**
 * Summary of worker health across all workers
 */
export interface WorkerHealthSummary {
  total: number;
  online: number;
  stale: number;
  offline: number;
  /** Most severe status among all workers */
  worstStatus: WorkerStatus;
}

// ============================================
// Raw API Response Types
// ============================================

/**
 * Account metadata from /api/account/{address}
 */
export interface AccountMetadata {
  block_count: number;
  highest_blockheight: number;
}

/**
 * Account data from /api/account/{address}
 */
export interface AccountApiResponse {
  account: {
    btc_address: string;
    ln_address: string | null;
    past_ln_addresses: string[];
    total_diff: number;
    last_updated: string;
    metadata: AccountMetadata;
  };
  lightning: unknown | null;
}

// ============================================
// Raw API Response Types (from /api/user/{address})
// ============================================

/**
 * Raw worker data from API response
 */
export interface UserWorkerApiResponse {
  id: string;
  name: string;
  hashrate: string; // API returns string
  bestDifficulty: string; // API returns string
  lastSubmission: string; // Unix timestamp as string
  uptime: string;
}

/**
 * Raw user stats from /api/user/{address}
 */
export interface UserStatsApiResponse {
  hashrate: number;
  workers: number; // This is a COUNT, not an array
  workerData: UserWorkerApiResponse[];
  lastSubmission: string; // "1m ago"
  bestDifficulty: string; // "1.12T" - formatted string
  uptime: string; // "256d 1h"
  isPublic: boolean;
}

// ============================================
// App Types (transformed for use in app)
// ============================================

/**
 * Individual worker connected to the pool (transformed)
 */
export interface UserWorker {
  id: string;
  name: string;
  hashrate: number;
  bestDifficulty: number;
  /** Last share submission timestamp */
  lastSubmission: number;
  status: WorkerStatus;
}

/**
 * User statistics (transformed from API response)
 */
export interface UserStats {
  /** Current hashrate in H/s */
  hashrate: number;
  /** Number of workers */
  workerCount: number;
  /** Worker details */
  workers: UserWorker[];
  /** Best difficulty achieved (raw number) */
  bestDifficulty: number;
  /** Best difficulty formatted string from API (e.g., "1.12T") */
  bestDifficultyFormatted: string;
  /** Last submission (e.g., "1m ago") */
  lastSubmission: string;
  /** Uptime string (e.g., "256d 1h") */
  uptime: string;
  /** Whether user is visible on leaderboards */
  isPublic: boolean;
  /** 1-hour average hashrate (computed from historical) */
  hashrate1h?: number;
  /** 24-hour average hashrate (computed from historical) */
  hashrate24h?: number;
}

/**
 * Account info (transformed from AccountApiResponse)
 */
export interface Account {
  btcAddress: string;
  lnAddress: string | null;
  totalDiff: number;
  lastUpdated: string;
  blockCount: number;
  highestBlockHeight: number;
}

/**
 * User historical data point (from /api/user/{address}/historical)
 * Note: API returns timestamp as ISO string, we convert to number
 */
export interface UserHistoricalPoint {
  timestamp: number;
  hashrate: number;
}

/**
 * Raw historical point from API
 */
export interface UserHistoricalPointApiResponse {
  timestamp: string; // ISO date string
  hashrate: number;
}

/**
 * User's difficulty entries (for user-diffs endpoint)
 */
export interface UserDiffEntry {
  difficulty: number;
  timestamp: number;
  block_height?: number;
}
