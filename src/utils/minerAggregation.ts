/**
 * Utility functions for aggregating stats across multiple miners
 */

import type { LocalMiner } from '@/types';

export interface AggregatedMinerStats {
  /** Sum of all online miner hashrates (GH/s) */
  totalHashrate: number;
  /** Total number of miners */
  minerCount: number;
  /** Number of online miners */
  onlineCount: number;
  /** Highest best difficulty across all miners */
  highestBestDiff: number;
}

/**
 * Aggregate stats from multiple miners sharing the same stratumUser
 */
export function aggregateMinerStats(miners: LocalMiner[]): AggregatedMinerStats {
  if (miners.length === 0) {
    return {
      totalHashrate: 0,
      minerCount: 0,
      onlineCount: 0,
      highestBestDiff: 0,
    };
  }

  const onlineMiners = miners.filter((m) => m.isOnline);

  return {
    totalHashrate: onlineMiners.reduce((sum, m) => sum + m.hashRate, 0),
    minerCount: miners.length,
    onlineCount: onlineMiners.length,
    highestBestDiff: Math.max(...miners.map((m) => m.bestDiff), 0),
  };
}
