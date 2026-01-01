/**
 * User/Worker data types for Parasite Pool
 */

/**
 * Worker status
 */
export type WorkerStatus = 'online' | 'offline';

/**
 * Individual worker connected to the pool
 */
export interface UserWorker {
  name: string;
  hashrate: number;
  bestDifficulty: number;
  /** Last share submission timestamp */
  lastSubmission: number;
  status: WorkerStatus;
}

/**
 * User statistics from /api/user/{address}
 */
export interface UserStats {
  address: string;
  /** Current hashrate */
  hashrate: number;
  /** 1-hour average hashrate */
  hashrate1h: number;
  /** 24-hour average hashrate */
  hashrate24h: number;
  /** Best difficulty achieved */
  bestDifficulty: number;
  sharesAccepted: number;
  sharesRejected: number;
  workers: UserWorker[];
  /** Whether user is visible on leaderboards */
  isPublic: boolean;
}

/**
 * User historical data point
 */
export interface UserHistoricalPoint {
  timestamp: number;
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
