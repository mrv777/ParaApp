export const PERSONAL_WIDGET_NAME = 'PersonalMiningWidget';
export const POOL_WIDGET_NAME = 'PoolOverviewWidget';

export const WIDGET_REFRESH_TARGET_MS = 30 * 60 * 1000;
// Mark data "Stale" only well past the 2h server fallback cadence, so normal
// event-driven refresh gaps don't falsely flag fresh-enough mining stats.
// NOTE: the 'widget'-directive render in widgets.tsx inlines this value
// (it bundles separately and can't import it) — keep them in sync.
export const WIDGET_STALE_AFTER_MS = 150 * 60 * 1000; // 2.5 hours

export type WidgetSnapshotSource = 'app' | 'server' | 'placeholder';

export interface WidgetFreshness {
  fetchedAt: number;
  source: WidgetSnapshotSource;
}

export interface PersonalMiningWidgetSnapshot extends WidgetFreshness {
  kind: 'personal';
  hasAddress: boolean;
  addressLabel: string;
  hashrate: string;
  hashrate1h: string;
  hashrate24h: string;
  workerCount: number;
  onlineWorkers: number;
  staleWorkers: number;
  offlineWorkers: number;
  bestDiff: string;
  lastSubmission: string;
}

export interface PoolOverviewWidgetSnapshot extends WidgetFreshness {
  kind: 'pool';
  poolHashrate: string;
  users: string;
  workers: string;
  highestDiff: string;
  lastBlock: string;
}

export interface WidgetSnapshotResponse<T> {
  success: boolean;
  data: T;
}
