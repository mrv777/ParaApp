/**
 * Sorting utilities for workers
 */

import type { UserWorker } from '@/types';
import type { WorkerSortOrder } from '@/store/settingsStore';

/**
 * Sort workers by the specified order
 */
export function sortWorkers(
  workers: UserWorker[],
  sortOrder: WorkerSortOrder
): UserWorker[] {
  if (!workers || workers.length === 0) return workers;

  const sorted = [...workers];

  switch (sortOrder) {
    case 'hashrate':
      // Sort by hashrate descending (highest first)
      sorted.sort((a, b) => b.hashrate - a.hashrate);
      break;
    case 'name':
      // Sort by name ascending (A-Z)
      sorted.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      break;
    case 'bestDiff':
      // Sort by best difficulty descending (highest first)
      sorted.sort((a, b) => b.bestDifficulty - a.bestDifficulty);
      break;
  }

  return sorted;
}

/**
 * Get display label for sort order
 */
export function getSortOrderLabel(sortOrder: WorkerSortOrder): string {
  switch (sortOrder) {
    case 'hashrate':
      return 'Hashrate';
    case 'name':
      return 'Name';
    case 'bestDiff':
      return 'Best Diff';
  }
}

/**
 * Get icon name for sort order
 */
export function getSortOrderIcon(sortOrder: WorkerSortOrder): string {
  switch (sortOrder) {
    case 'hashrate':
      return 'speedometer-outline';
    case 'name':
      return 'text-outline';
    case 'bestDiff':
      return 'trophy-outline';
  }
}
