import type {
  ParasitePoolStatsResponse,
  ParasiteUserResponse,
  ParasiteWorker,
} from './types';

const STALE_THRESHOLD_SECONDS = 300;

const HASHRATE_UNITS = ['H/s', 'KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s', 'EH/s'];

function formatSignificantDigits(value: number): string {
  if (value >= 100) return Math.round(value).toString();
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function formatHashrate(hashrate: number): string {
  if (hashrate === 0) return '0 H/s';
  if (!Number.isFinite(hashrate)) return '-- H/s';

  let unitIndex = 0;
  let value = hashrate;

  while (value >= 1000 && unitIndex < HASHRATE_UNITS.length - 1) {
    value /= 1000;
    unitIndex++;
  }

  return `${formatSignificantDigits(value)} ${HASHRATE_UNITS[unitIndex]}`;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '--';
  return value.toLocaleString('en-US');
}

function truncateAddress(address: string): string {
  if (address.length <= 13) return address;
  return `${address.slice(0, 5)}...${address.slice(-5)}`;
}

function parseWorkerHashrate(worker: ParasiteWorker): number {
  return Number.parseFloat(worker.hashrate) || 0;
}

function getWorkerStatus(worker: ParasiteWorker): 'online' | 'stale' | 'offline' {
  const hashrate = parseWorkerHashrate(worker);
  if (hashrate <= 0) return 'offline';

  const lastSubmission = Number.parseInt(worker.lastSubmission, 10) || 0;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - lastSubmission > STALE_THRESHOLD_SECONDS) return 'stale';

  return 'online';
}

export function buildPoolWidgetSnapshot(
  stats: ParasitePoolStatsResponse,
  fetchedAt: number = Date.now()
) {
  return {
    kind: 'pool' as const,
    poolHashrate: formatHashrate(stats.hashrate),
    users: formatNumber(stats.users),
    workers: formatNumber(stats.workers),
    highestDiff: stats.highestDifficulty || '--',
    lastBlock: stats.lastBlockTime ? `#${stats.lastBlockTime}` : '--',
    fetchedAt,
    source: 'server' as const,
  };
}

export function buildUserWidgetSnapshot(
  address: string,
  user: ParasiteUserResponse,
  fetchedAt: number = Date.now()
) {
  const workers = user.workerData || [];
  const onlineWorkers = workers.filter((worker) => getWorkerStatus(worker) === 'online').length;
  const staleWorkers = workers.filter((worker) => getWorkerStatus(worker) === 'stale').length;
  const offlineWorkers = workers.filter((worker) => getWorkerStatus(worker) === 'offline').length;

  return {
    kind: 'personal' as const,
    hasAddress: true,
    addressLabel: truncateAddress(address),
    hashrate: formatHashrate(user.hashrate),
    hashrate1h: '-- H/s',
    hashrate24h: '-- H/s',
    workerCount: user.workers,
    onlineWorkers,
    staleWorkers,
    offlineWorkers,
    bestDiff: user.bestDifficulty || '--',
    lastSubmission: user.lastSubmission || '--',
    fetchedAt,
    source: 'server' as const,
  };
}
