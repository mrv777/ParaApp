import { describe, expect, it } from 'vitest';

import {
  buildAuctionIndex,
  findSlotAuction,
  type DispenserSlot,
  type LiveAuction,
} from './dispenser';

const auction: LiveAuction = {
  id: 'a1',
  inscription_id: 'insc123i0',
  outpoint: 'txid123:0',
  end_time: 1_790_000_000,
  current_high: null,
  min_next_bid: 21_000,
};

function slot(overrides: Partial<DispenserSlot>): DispenserSlot {
  return {
    tier: 'gold',
    utxo: null,
    inscriptionId: '',
    claimed: false,
    index: 0,
    tierSlotIndex: 0,
    ...overrides,
  };
}

describe('buildAuctionIndex / findSlotAuction', () => {
  const index = buildAuctionIndex([auction]);

  it('indexes by both inscription id and outpoint', () => {
    expect(index.get('insc123i0')).toBe(auction);
    expect(index.get('txid123:0')).toBe(auction);
  });

  it('resolves a slot via inscription id', () => {
    expect(findSlotAuction(index, slot({ inscriptionId: 'insc123i0' }))).toBe(auction);
  });

  it('falls back to the utxo outpoint', () => {
    expect(findSlotAuction(index, slot({ utxo: 'txid123:0' }))).toBe(auction);
  });

  it('returns null when neither identifier matches', () => {
    expect(findSlotAuction(index, slot({ inscriptionId: 'other', utxo: 'nope:1' }))).toBeNull();
  });

  it('resolves every item in a bundled auction to the same auction', () => {
    const bundle = { ...auction, items: [
      { inscription_id: 'first', outpoint: 'first:0' },
      { inscription_id: 'second', outpoint: 'second:1' },
    ] };
    const bundles = buildAuctionIndex([bundle]);
    expect(findSlotAuction(bundles, slot({ inscriptionId: 'second' }))).toBe(bundle);
    expect(findSlotAuction(bundles, slot({ utxo: 'second:1' }))).toBe(bundle);
    expect(findSlotAuction(bundles, slot({ inscriptionId: 'first' }))).toBe(bundle);
  });

  it('retains single-item compatibility when the optional bundle list is empty', () => {
    const single = { ...auction, items: [] };
    expect(findSlotAuction(buildAuctionIndex([single]), slot({ utxo: 'txid123:0' }))).toBe(single);
  });

  it('never matches code slots (empty inscription id) via the empty-string key', () => {
    const weird = buildAuctionIndex([{ ...auction, inscription_id: '', outpoint: '' }]);
    expect(weird.size).toBe(0);
    expect(findSlotAuction(weird, slot({}))).toBeNull();
  });
});
