import { describe, expect, it } from 'vitest';

import {
  buildBadgeMedals,
  extractBadgeCounts,
  hasAnyBadge,
  LOYALTY_BLOCKS_PER_INSTANCE,
  type BadgesPayload,
} from './badges';

const payload: BadgesPayload = {
  version: 2,
  computed_at: '2026-08-06T00:00:00Z',
  types: {
    block: {
      kind: 'unique_then_bucket',
      unique: [{ blockheight: 900_001 }, { blockheight: 900_002 }],
      bucket: { count: 5 },
      total: 7,
    },
    block_winner: {
      kind: 'unique',
      unique: [{ blockheight: 900_001 }],
      bucket: { count: 0 },
      total: 1,
    },
    loyalty: { kind: 'bucket', unique: [], bucket: { count: 3 }, total: 3 },
    refinery: { kind: 'bucket', unique: [], bucket: { count: 1 }, total: 1 },
    // Unknown future kinds must be ignored, not crash
    mystery_future_badge: { kind: 'bucket', unique: [], bucket: { count: 9 }, total: 9 },
  },
};

describe('extractBadgeCounts', () => {
  it('flattens a payload into per-kind counts', () => {
    const counts = extractBadgeCounts(payload);
    expect(counts.winners).toEqual([{ blockheight: 900_001 }]);
    expect(counts.blockUnique).toHaveLength(2);
    expect(counts.blockStacked).toBe(5);
    expect(counts.loyalty).toBe(3);
    expect(counts.refinery).toBe(1);
    expect(counts.auctionWins).toBe(0);
    expect(counts.bravocado).toBe(0);
    expect(counts.miner).toBe(0);
    expect(counts.dispenser).toBe(0);
  });

  it('defaults everything for null or empty payloads', () => {
    for (const input of [null, { version: 2, computed_at: '', types: {} }]) {
      const counts = extractBadgeCounts(input as BadgesPayload | null);
      expect(hasAnyBadge(counts)).toBe(false);
      expect(buildBadgeMedals(counts)).toEqual([]);
    }
  });

  it('tolerates missing unique/bucket fields on a type', () => {
    const sparse = {
      version: 2,
      computed_at: '',
      types: { block: { kind: 'unique_then_bucket' } },
    } as unknown as BadgesPayload;
    const counts = extractBadgeCounts(sparse);
    expect(counts.blockUnique).toEqual([]);
    expect(counts.blockStacked).toBe(0);
  });
});

describe('buildBadgeMedals', () => {
  it('orders medals winners → block unique → stacked kinds and keys them uniquely', () => {
    const medals = buildBadgeMedals(extractBadgeCounts(payload));
    expect(medals.map((m) => m.key)).toEqual([
      'w-900001',
      'b-900001',
      'b-900002',
      'block_stack',
      'loyalty',
      'refinery',
    ]);
    // A height can appear as both a winner and a block medal (distinct keys)
    expect(medals[0]).toMatchObject({ type: 'winner', blockHeight: 900_001 });
    expect(medals[1]).toMatchObject({ type: 'block', blockHeight: 900_001 });
    expect(medals[3]).toMatchObject({ type: 'stacked', kind: 'block_stack', count: 5 });
  });

  it('omits stacked kinds with zero count', () => {
    const medals = buildBadgeMedals(extractBadgeCounts(payload));
    expect(medals.find((m) => m.type === 'stacked' && m.kind === 'dispenser')).toBeUndefined();
  });
});

describe('loyalty math', () => {
  it('3 instances = 63k blocks', () => {
    expect((3 * LOYALTY_BLOCKS_PER_INSTANCE) / 1000).toBe(63);
  });
});
