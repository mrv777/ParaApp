import type { RoundWorkLeaderboardEntry } from '@/types';

export interface PoolWorkValue {
  value: number | null;
  isLowerBound: boolean;
}

/** Build the public Parasite block URL only when a usable height exists. */
export function getPoolBlockUrl(blockHeight: string | null | undefined): string | null {
  const height = blockHeight?.trim();
  if (!height || !/^\d+$/.test(height) || height === '0') return null;
  return `https://parasite.space/block/${height}`;
}

/**
 * Prefer the pool API's exact current-round total (`workSinceLastBlock`). When
 * it's unavailable — null/zero, or lagging behind what we can already see — fall
 * back to the sum of the loaded visible work entries as an explicitly marked
 * lower bound.
 */
export function derivePoolWork(
  exactWork: number | null | undefined,
  entries: readonly RoundWorkLeaderboardEntry[]
): PoolWorkValue {
  let visibleWork = 0;

  for (const entry of entries) {
    const work = entry.total_work;
    if (!Number.isFinite(work) || work < 0) continue;

    const nextTotal = visibleWork + work;
    if (Number.isFinite(nextTotal)) visibleWork = nextTotal;
  }

  if (
    typeof exactWork === 'number' &&
    Number.isFinite(exactWork) &&
    exactWork > 0 &&
    exactWork >= visibleWork
  ) {
    return { value: exactWork, isLowerBound: false };
  }

  if (visibleWork > 0) {
    return { value: visibleWork, isLowerBound: true };
  }

  return { value: null, isLowerBound: false };
}
