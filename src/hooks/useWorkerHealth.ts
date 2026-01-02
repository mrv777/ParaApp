/**
 * useWorkerHealth - Calculate worker health summary from workers array
 */

import { useMemo } from 'react';
import type { UserWorker, WorkerHealthSummary } from '@/types';

const EMPTY_SUMMARY: WorkerHealthSummary = {
  total: 0,
  online: 0,
  stale: 0,
  offline: 0,
  worstStatus: 'online',
};

export function useWorkerHealth(workers: UserWorker[]): WorkerHealthSummary {
  return useMemo(() => {
    if (!workers || workers.length === 0) {
      return EMPTY_SUMMARY;
    }

    const summary: WorkerHealthSummary = {
      total: workers.length,
      online: 0,
      stale: 0,
      offline: 0,
      worstStatus: 'online',
    };

    for (const worker of workers) {
      summary[worker.status]++;
    }

    // Determine worst status (offline > stale > online)
    if (summary.offline > 0) {
      summary.worstStatus = 'offline';
    } else if (summary.stale > 0) {
      summary.worstStatus = 'stale';
    }

    return summary;
  }, [workers]);
}
