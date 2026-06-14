import { describe, expect, it } from 'vitest';

import type { UserStats } from '@/types';
import {
  buildPersonalMiningSnapshot,
  getWidgetFreshnessLabel,
  isWidgetSnapshotStale,
} from './snapshots';

describe('widget snapshots', () => {
  it('marks snapshots stale after one hour', () => {
    const fetchedAt = 1_000_000;

    expect(isWidgetSnapshotStale(fetchedAt, fetchedAt + 60 * 60 * 1000)).toBe(false);
    expect(isWidgetSnapshotStale(fetchedAt, fetchedAt + 60 * 60 * 1000 + 1)).toBe(true);
  });

  it('formats freshness labels for current, recent, and stale snapshots', () => {
    const fetchedAt = 1_000_000;

    expect(getWidgetFreshnessLabel(fetchedAt, fetchedAt + 30 * 1000)).toBe('Updated now');
    expect(getWidgetFreshnessLabel(fetchedAt, fetchedAt + 12 * 60 * 1000)).toBe(
      'Updated 12m ago'
    );
    expect(getWidgetFreshnessLabel(fetchedAt, fetchedAt + 61 * 60 * 1000)).toBe('Stale');
  });

  it('builds personal mining worker health counts', () => {
    const stats: UserStats = {
      hashrate: 1_250_000_000_000,
      workerCount: 3,
      workers: [
        {
          id: '1',
          name: 'worker-1',
          hashrate: 1,
          bestDifficulty: 100,
          lastSubmission: 1,
          status: 'online',
        },
        {
          id: '2',
          name: 'worker-2',
          hashrate: 1,
          bestDifficulty: 100,
          lastSubmission: 1,
          status: 'stale',
        },
        {
          id: '3',
          name: 'worker-3',
          hashrate: 0,
          bestDifficulty: 100,
          lastSubmission: 1,
          status: 'offline',
        },
      ],
      bestDifficulty: 1_000_000,
      bestDifficultyFormatted: '1.00M',
      lastSubmission: '2m ago',
      uptime: '1d',
      hashrate1h: 1_100_000_000_000,
      hashrate24h: 900_000_000_000,
    };

    const snapshot = buildPersonalMiningSnapshot(
      'bc1q000000000000000000000000000000000000000',
      stats,
      123
    );

    expect(snapshot.hashrate).toBe('1.25 TH/s');
    expect(snapshot.onlineWorkers).toBe(1);
    expect(snapshot.staleWorkers).toBe(1);
    expect(snapshot.offlineWorkers).toBe(1);
    expect(snapshot.bestDiff).toBe('1.00M');
  });
});
