import type { HistoricalPeriod, UserDifficultyHit, UserHistoricalPoint } from '@/types';

export const MAX_DIFFICULTY_MARKERS = 9;

export function supportsDifficultyHits(period: HistoricalPeriod): boolean {
  return period === '1h' || period === '24h';
}

function getHistoricalWindow(
  historical: UserHistoricalPoint[]
): { minTimestamp: number; maxTimestamp: number } | null {
  let minTimestamp = Infinity;
  let maxTimestamp = -Infinity;
  for (const point of historical) {
    if (!Number.isFinite(point.timestamp)) continue;
    minTimestamp = Math.min(minTimestamp, point.timestamp);
    maxTimestamp = Math.max(maxTimestamp, point.timestamp);
  }

  if (minTimestamp === Infinity || maxTimestamp === -Infinity) return null;
  return { minTimestamp, maxTimestamp };
}

/**
 * Select the strongest per-block difficulties that fall inside the chart's
 * actual data window. Selection is by difficulty; output is chronological so
 * the native hit rail follows the time axis naturally.
 */
export function selectVisibleDifficultyHits(
  hits: UserDifficultyHit[],
  historical: UserHistoricalPoint[],
  period: HistoricalPeriod,
  limit: number = MAX_DIFFICULTY_MARKERS
): UserDifficultyHit[] {
  if (
    !supportsDifficultyHits(period) ||
    hits.length === 0 ||
    historical.length === 0 ||
    limit <= 0
  ) {
    return [];
  }

  const window = getHistoricalWindow(historical);
  if (!window) return [];
  const { minTimestamp, maxTimestamp } = window;

  return hits
    .filter(
      (hit) =>
        Number.isFinite(hit.timestamp) &&
        Number.isFinite(hit.difficulty) &&
        hit.difficulty > 0 &&
        hit.timestamp >= minTimestamp &&
        hit.timestamp <= maxTimestamp
    )
    .sort((a, b) => b.difficulty - a.difficulty)
    .slice(0, Math.min(Math.trunc(limit), MAX_DIFFICULTY_MARKERS))
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function getHighestDifficultyHit(hits: UserDifficultyHit[]): UserDifficultyHit | null {
  let highest: UserDifficultyHit | null = null;
  for (const hit of hits) {
    if (!highest || hit.difficulty > highest.difficulty) highest = hit;
  }
  return highest;
}

/** Return a hit's normalized horizontal position in the historical window. */
export function getDifficultyHitPosition(
  hit: UserDifficultyHit,
  historical: UserHistoricalPoint[]
): number | null {
  const window = getHistoricalWindow(historical);
  if (!window) return null;
  const span = window.maxTimestamp - window.minTimestamp;
  if (span <= 0 || hit.timestamp < window.minTimestamp || hit.timestamp > window.maxTimestamp) {
    return null;
  }

  return (hit.timestamp - window.minTimestamp) / span;
}

/** Select the temporally nearest hit to a normalized tap position on the rail. */
export function getNearestDifficultyHit(
  hits: UserDifficultyHit[],
  historical: UserHistoricalPoint[],
  normalizedPosition: number
): UserDifficultyHit | null {
  const window = getHistoricalWindow(historical);
  if (!window || hits.length === 0 || !Number.isFinite(normalizedPosition)) return null;

  const clampedPosition = Math.max(0, Math.min(1, normalizedPosition));
  const targetTimestamp =
    window.minTimestamp + clampedPosition * (window.maxTimestamp - window.minTimestamp);

  let nearest: UserDifficultyHit | null = null;
  let nearestDistance = Infinity;
  for (const hit of hits) {
    const distance = Math.abs(hit.timestamp - targetTimestamp);
    if (distance < nearestDistance) {
      nearest = hit;
      nearestDistance = distance;
    }
  }
  return nearest;
}
