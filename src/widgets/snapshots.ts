import type { PoolStats, UserStats } from '@/types';
import {
  formatDifficulty,
  formatHashrate,
  formatNumber,
  truncateAddress,
} from '@/utils/formatting';
import {
  WIDGET_REFRESH_TARGET_MS,
  WIDGET_STALE_AFTER_MS,
  type PersonalMiningWidgetSnapshot,
  type PoolOverviewWidgetSnapshot,
} from './types';

export function buildNoAddressPersonalSnapshot(
  fetchedAt: number = Date.now()
): PersonalMiningWidgetSnapshot {
  return {
    kind: 'personal',
    hasAddress: false,
    addressLabel: 'Add address',
    hashrate: '-- H/s',
    hashrate1h: '-- H/s',
    hashrate24h: '-- H/s',
    workerCount: 0,
    onlineWorkers: 0,
    staleWorkers: 0,
    offlineWorkers: 0,
    bestDiff: '--',
    lastSubmission: '--',
    fetchedAt,
    source: 'placeholder',
  };
}

export function buildPersonalMiningSnapshot(
  address: string,
  stats: UserStats,
  fetchedAt: number = Date.now()
): PersonalMiningWidgetSnapshot {
  const onlineWorkers = stats.workers.filter((worker) => worker.status === 'online').length;
  const staleWorkers = stats.workers.filter((worker) => worker.status === 'stale').length;
  const offlineWorkers = stats.workers.filter((worker) => worker.status === 'offline').length;

  return {
    kind: 'personal',
    hasAddress: true,
    addressLabel: truncateAddress(address, 5),
    hashrate: formatHashrate(stats.hashrate),
    hashrate1h:
      stats.hashrate1h === undefined ? '-- H/s' : formatHashrate(stats.hashrate1h),
    hashrate24h:
      stats.hashrate24h === undefined ? '-- H/s' : formatHashrate(stats.hashrate24h),
    workerCount: stats.workerCount,
    onlineWorkers,
    staleWorkers,
    offlineWorkers,
    bestDiff: stats.bestDifficultyFormatted || formatDifficulty(stats.bestDifficulty),
    lastSubmission: stats.lastSubmission || '--',
    fetchedAt,
    source: 'app',
  };
}

export function buildPoolOverviewSnapshot(
  stats: PoolStats,
  fetchedAt: number = Date.now()
): PoolOverviewWidgetSnapshot {
  return {
    kind: 'pool',
    poolHashrate: formatHashrate(stats.hashrate),
    users: formatNumber(stats.users),
    workers: formatNumber(stats.workers),
    highestDiff: stats.highestDifficulty || '--',
    lastBlock: stats.lastBlockTime ? `#${stats.lastBlockTime}` : '--',
    fetchedAt,
    source: 'app',
  };
}

export function isWidgetSnapshotStale(
  fetchedAt: number,
  now: number = Date.now()
): boolean {
  return now - fetchedAt > WIDGET_STALE_AFTER_MS;
}

export function getWidgetFreshnessLabel(
  fetchedAt: number,
  now: number = Date.now()
): string {
  if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) return 'No data';

  const ageMs = Math.max(0, now - fetchedAt);
  if (ageMs > WIDGET_STALE_AFTER_MS) return 'Stale';
  if (ageMs < 60 * 1000) return 'Updated now';

  const minutes = Math.floor(ageMs / (60 * 1000));
  if (minutes < 60) return `Updated ${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  return `Updated ${hours}h ago`;
}

export function getWidgetFreshnessColor(
  fetchedAt: number,
  now: number = Date.now()
): string {
  const ageMs = Math.max(0, now - fetchedAt);
  if (ageMs > WIDGET_STALE_AFTER_MS) return '#facc15';
  if (ageMs > WIDGET_REFRESH_TARGET_MS) return '#8a8a8a';
  return '#22c55e';
}

// Re-render checkpoints (minutes from now) for a single pushed snapshot. The
// widget renders from these without a data push, so the ladder's job is to flip
// the "Stale" badge promptly: entries bracket the 2.5h threshold (150m), with
// 151m crossing it and 180m as the final `.atEnd` reload point (same data,
// already "Stale") to avoid pointless earlier reloads.
const WIDGET_TIMELINE_CHECKPOINTS_MIN = [0, 60, 120, 150, 151, 180];

export function buildWidgetTimeline<T extends { fetchedAt: number }>(
  snapshot: T,
  now: number = Date.now()
): { date: Date; props: T }[] {
  return WIDGET_TIMELINE_CHECKPOINTS_MIN.map((minutes) => ({
    date: new Date(now + minutes * 60 * 1000),
    props: snapshot,
  }));
}
