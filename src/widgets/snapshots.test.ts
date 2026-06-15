import { describe, expect, it } from 'vitest';

import type { UserStats } from '@/types';
import {
  buildPersonalMiningSnapshot,
  getWidgetFreshnessLabel,
  isWidgetSnapshotStale,
} from './snapshots';
import { WIDGET_STALE_AFTER_MS } from './types';

describe('widget snapshots', () => {
  it('marks snapshots stale only past the 2.5h stale threshold', () => {
    const fetchedAt = 1_000_000;

    // Lock the threshold value so an accidental change is caught here.
    expect(WIDGET_STALE_AFTER_MS).toBe(150 * 60 * 1000);

    expect(isWidgetSnapshotStale(fetchedAt, fetchedAt + WIDGET_STALE_AFTER_MS)).toBe(false);
    expect(isWidgetSnapshotStale(fetchedAt, fetchedAt + WIDGET_STALE_AFTER_MS + 1)).toBe(true);
  });

  it('formats freshness labels for current, recent, and stale snapshots', () => {
    const fetchedAt = 1_000_000;

    expect(getWidgetFreshnessLabel(fetchedAt, fetchedAt + 30 * 1000)).toBe('Updated now');
    expect(getWidgetFreshnessLabel(fetchedAt, fetchedAt + 12 * 60 * 1000)).toBe(
      'Updated 12m ago'
    );
    // Past 1h but within the 2.5h threshold is now "Updated 1h ago", not "Stale".
    expect(getWidgetFreshnessLabel(fetchedAt, fetchedAt + 61 * 60 * 1000)).toBe(
      'Updated 1h ago'
    );
    expect(getWidgetFreshnessLabel(fetchedAt, fetchedAt + WIDGET_STALE_AFTER_MS + 1)).toBe(
      'Stale'
    );
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
