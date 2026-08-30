import { describe, expect, it } from 'vitest';

import {
  MAX_REMOTE_ITEMS,
  boundedRemoteItems,
  finiteNumberRange,
} from './finiteNumbers';

describe('finiteNumberRange', () => {
  it('computes a finite range without variadic arguments', () => {
    expect(finiteNumberRange([3, -2, 8, Number.NaN, Infinity])).toEqual({
      min: -2,
      max: 8,
      sum: 9,
      count: 3,
    });
  });

  it('handles very large iterables and empty finite input', () => {
    expect(finiteNumberRange(Array.from({ length: 100_000 }, (_, i) => i))).toMatchObject({
      min: 0,
      max: 99_999,
      count: 100_000,
    });
    expect(finiteNumberRange([Number.NaN, Infinity])).toBeNull();
  });
});

describe('boundedRemoteItems', () => {
  it('keeps normal arrays and caps oversized remote arrays', () => {
    expect(boundedRemoteItems([1, 2, 3])).toEqual([1, 2, 3]);
    expect(
      boundedRemoteItems(Array.from({ length: MAX_REMOTE_ITEMS + 10 }, (_, i) => i))
    ).toHaveLength(MAX_REMOTE_ITEMS);
  });
});
