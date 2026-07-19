import { describe, expect, it } from 'vitest';

import type { RoundWorkLeaderboardEntry } from '@/types';
import { formatExpectedBlockTime } from './formatting';
import { derivePoolWork, getPoolBlockUrl } from './poolStats';

function workEntry(totalWork: number): RoundWorkLeaderboardEntry {
  return {
    rank: 1,
    address: 'bc1q...test',
    top_diff: 0,
    blocks_participated: 1,
    total_work: totalWork,
  };
}

describe('formatExpectedBlockTime', () => {
  it('formats the expected time with two compact units', () => {
    const expectedSeconds = 3 * 86_400 + 16 * 3_600;
    const difficulty = 127_170_500_429_035.2;
    const hashrate = (difficulty * Math.pow(2, 32)) / expectedSeconds;

    expect(formatExpectedBlockTime(hashrate, difficulty)).toBe('3d 16h');
  });

  it('carries a rounded second unit into the larger unit', () => {
    const difficulty = 1;
    const hashrate = Math.pow(2, 32) / (23 * 3_600 + 59.6 * 60);

    expect(formatExpectedBlockTime(hashrate, difficulty)).toBe('1d');
  });

  it.each([
    [0, 1],
    [1, 0],
    [-1, 1],
    [1, Number.NaN],
    [Number.POSITIVE_INFINITY, 1],
    [undefined, 1],
    [1, null],
  ])('returns a placeholder for invalid inputs (%s, %s)', (hashrate, difficulty) => {
    expect(formatExpectedBlockTime(hashrate, difficulty)).toBe('--');
  });
});

describe('derivePoolWork', () => {
  it('prefers an exact total at least as large as the visible sum', () => {
    expect(derivePoolWork(500, [workEntry(100), workEntry(200)])).toEqual({
      value: 500,
      isLowerBound: false,
    });
  });

  it('uses the visible sum when the API still returns its zero placeholder', () => {
    expect(derivePoolWork(0, [workEntry(100), workEntry(200)])).toEqual({
      value: 300,
      isLowerBound: true,
    });
  });

  it('uses the visible sum when an exact total is lagging behind it', () => {
    expect(derivePoolWork(250, [workEntry(100), workEntry(200)])).toEqual({
      value: 300,
      isLowerBound: true,
    });
  });

  it('ignores malformed and negative work values', () => {
    const malformed = [
      workEntry(100),
      workEntry(Number.NaN),
      workEntry(Number.POSITIVE_INFINITY),
      workEntry(-50),
    ];

    expect(derivePoolWork(undefined, malformed)).toEqual({
      value: 100,
      isLowerBound: true,
    });
  });

  it('returns no value when neither source has usable work', () => {
    expect(derivePoolWork(0, [])).toEqual({ value: null, isLowerBound: false });
    expect(derivePoolWork(null, [workEntry(0)])).toEqual({
      value: null,
      isLowerBound: false,
    });
  });
});

describe('getPoolBlockUrl', () => {
  it('builds the Parasite block link from a height', () => {
    expect(getPoolBlockUrl('958527')).toBe('https://parasite.space/block/958527');
  });

  it.each([undefined, null, '', '  ', '0', 'not-a-height'])(
    'returns no link for an unavailable height (%s)',
    (height) => {
      expect(getPoolBlockUrl(height)).toBeNull();
    }
  );
});
