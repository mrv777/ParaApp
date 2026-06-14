export const PERSONAL_WIDGET_NAME = 'PersonalMiningWidget';
export const POOL_WIDGET_NAME = 'PoolOverviewWidget';

export const WIDGET_REFRESH_TARGET_MS = 30 * 60 * 1000;
export const WIDGET_STALE_AFTER_MS = 60 * 60 * 1000;

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
