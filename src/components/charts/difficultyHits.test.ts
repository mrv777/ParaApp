import { describe, expect, it } from 'vitest';

import {
  getDifficultyHitPosition,
  getHighestDifficultyHit,
  getNearestDifficultyHit,
  selectVisibleDifficultyHits,
  supportsDifficultyHits,
} from './difficultyHits';
import type { UserDifficultyHit, UserHistoricalPoint } from '@/types';

const historical: UserHistoricalPoint[] = [
  { timestamp: 1_000, hashrate: 10 },
  { timestamp: 2_000, hashrate: 20 },
  { timestamp: 3_000, hashrate: 30 },
];

function hit(blockHeight: number, timestamp: number, difficulty: number): UserDifficultyHit {
  return { blockHeight, timestamp, difficulty };
}

describe('difficulty hit selection', () => {
  it('filters to the real chart window and returns strongest hits chronologically', () => {
    const hits = [
      hit(1, 500, 1_000),
      hit(2, 2_800, 20),
      hit(3, 1_200, 30),
      hit(4, 2_100, 10),
      hit(5, 4_000, 2_000),
    ];

    expect(selectVisibleDifficultyHits(hits, historical, '24h', 2)).toEqual([hits[2], hits[1]]);
  });

  it('caps the result at nine markers and rejects invalid difficulty values', () => {
    const hits = Array.from({ length: 12 }, (_, index) =>
      hit(index + 1, 1_000 + index * 100, index + 1)
    );
    hits.push(hit(20, 1_500, 0));

    const selected = selectVisibleDifficultyHits(
      hits,
      [
        { timestamp: 1_000, hashrate: 1 },
        { timestamp: 3_000, hashrate: 1 },
      ],
      '24h',
      99
    );

    expect(selected).toHaveLength(9);
    expect(selected.every((entry) => entry.difficulty > 0)).toBe(true);
    expect(selected.map((entry) => entry.difficulty)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('suppresses markers for 7d and 30d', () => {
    const hits = [hit(1, 2_000, 10)];
    expect(supportsDifficultyHits('1h')).toBe(true);
    expect(supportsDifficultyHits('24h')).toBe(true);
    expect(selectVisibleDifficultyHits(hits, historical, '7d')).toEqual([]);
    expect(selectVisibleDifficultyHits(hits, historical, '30d')).toEqual([]);
  });

  it('selects the highest visible hit for the default callout', () => {
    const hits = [hit(1, 1_000, 10), hit(2, 2_000, 50), hit(3, 3_000, 20)];
    expect(getHighestDifficultyHit(hits)).toBe(hits[1]);
    expect(getHighestDifficultyHit([])).toBeNull();
  });

  it('positions rail ticks by their actual timestamp', () => {
    expect(getDifficultyHitPosition(hit(1, 1_500, 10), historical)).toBe(0.25);
    expect(getDifficultyHitPosition(hit(2, 3_001, 10), historical)).toBeNull();
  });

  it('selects the hit nearest to a rail tap and clamps edge taps', () => {
    const hits = [hit(1, 1_200, 10), hit(2, 2_100, 20), hit(3, 2_900, 30)];

    expect(getNearestDifficultyHit(hits, historical, 0.48)).toBe(hits[1]);
    expect(getNearestDifficultyHit(hits, historical, -1)).toBe(hits[0]);
    expect(getNearestDifficultyHit(hits, historical, 2)).toBe(hits[2]);
    expect(getNearestDifficultyHit([], historical, 0.5)).toBeNull();
  });
});
