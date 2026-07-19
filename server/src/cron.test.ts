import { describe, expect, it } from 'vitest';

import {
  buildCronSummary,
  buildDispenserCounts,
  diffDispenserRewards,
  getUserRotationOffset,
  shouldCheckDispenser,
} from './cron';

describe('getUserRotationOffset', () => {
  it.each([2, 37, 74, 302, 335])(
    'visits every start offset for an address count of %i',
    (addressCount) => {
      const offsets = new Set<number>();
      for (let minute = 0; minute < addressCount; minute++) {
        offsets.add(getUserRotationOffset(minute * 60_000, addressCount));
      }
      expect(offsets.size).toBe(addressCount);
    }
  );

  it('returns zero for empty and single-address runs', () => {
    expect(getUserRotationOffset(Date.now(), 0)).toBe(0);
    expect(getUserRotationOffset(Date.now(), 1)).toBe(0);
  });
});

const healthySummary = {
  scheduledTime: 1_783_864_000_000,
  durationMs: 47_000,
  totalAddresses: 302,
  attemptedAddresses: 222,
  updatedAddresses: 222,
  userFailures: 0,
  deadlineReached: true,
  notificationsQueued: 4,
  pushFailures: 0,
  invalidTokens: 0,
  claimFailed: false,
  maintenanceFailures: 0,
};

describe('buildCronSummary', () => {
  it('treats expected two-tick rotating coverage as healthy', () => {
    const summary = buildCronSummary(healthySummary);
    expect(summary.coverageTicks).toBe(2);
    expect(summary.deadlineReached).toBe(true);
    expect(summary.warningReasons).toEqual([]);
  });

  it('warns when growth pushes coverage beyond two ticks', () => {
    const summary = buildCronSummary({
      ...healthySummary,
      totalAddresses: 500,
      updatedAddresses: 200,
    });
    expect(summary.coverageTicks).toBe(3);
    expect(summary.warningReasons).toContain('coverage_over_two_ticks');
  });

  it('handles empty and completely failed runs without division errors', () => {
    expect(
      buildCronSummary({
        ...healthySummary,
        totalAddresses: 0,
        attemptedAddresses: 0,
        updatedAddresses: 0,
      }).coverageTicks
    ).toBe(0);

    const failed = buildCronSummary({
      ...healthySummary,
      attemptedAddresses: 6,
      updatedAddresses: 0,
      userFailures: 6,
      topLevelError: true,
    });
    expect(failed.coverageTicks).toBeNull();
    expect(failed.warningReasons).toEqual(
      expect.arrayContaining([
        'top_level_error',
        'no_user_updates',
        'user_failures',
      ])
    );
  });

  it('surfaces duration, claim, maintenance, and push failures', () => {
    const summary = buildCronSummary({
      ...healthySummary,
      durationMs: 52_001,
      claimFailed: true,
      maintenanceFailures: 1,
      pushFailures: 2,
    });
    expect(summary.warningReasons).toEqual(
      expect.arrayContaining([
        'duration_over_52s',
        'tick_claim_failed',
        'maintenance_failures',
        'push_failures',
      ])
    );
  });
});

describe('shouldCheckDispenser', () => {
  const addresses = Array.from({ length: 40 }, (_, i) => `bc1qtestaddress${i}xyz`);

  it('checks every address exactly once per interval', () => {
    for (const address of addresses) {
      let checks = 0;
      for (let minute = 0; minute < 5; minute++) {
        if (shouldCheckDispenser(address, minute * 60_000)) checks++;
      }
      expect(checks).toBe(1);
    }
  });

  it('is deterministic for a given address and tick', () => {
    for (const address of addresses) {
      expect(shouldCheckDispenser(address, 120_000)).toBe(
        shouldCheckDispenser(address, 120_000)
      );
    }
  });
});

describe('buildDispenserCounts', () => {
  it('counts assigned inscriptions per tier and override slots', () => {
    expect(
      buildDispenserCounts({
        override_slots: 2,
        assigned_inscription_ids: { gold: ['a', 'b'], silver: ['c'], empty: [] },
      })
    ).toEqual({ gold: 2, silver: 1, __override: 2 });
  });

  it('returns empty counts for an empty payload', () => {
    expect(buildDispenserCounts({})).toEqual({});
    expect(buildDispenserCounts({ override_slots: 0 })).toEqual({});
  });
});

describe('diffDispenserRewards', () => {
  it('establishes a baseline without notifying on first observation', () => {
    const { newSlots, nextState } = diffDispenserRewards(null, { gold: 2 });
    expect(newSlots).toEqual([]);
    expect(JSON.parse(nextState)).toEqual({ gold: 2 });
  });

  it('treats unparseable stored state as a baseline', () => {
    expect(diffDispenserRewards('not json', { gold: 3 }).newSlots).toEqual([]);
    expect(diffDispenserRewards('[1,2]', { gold: 3 }).newSlots).toEqual([]);
  });

  it('notifies on per-tier increases and advances the watermark', () => {
    const { newSlots, nextState } = diffDispenserRewards(
      JSON.stringify({ gold: 1 }),
      { gold: 2, silver: 1 }
    );
    expect(newSlots).toEqual([
      { tier: 'gold', count: 1 },
      { tier: 'silver', count: 1 },
    ]);
    expect(JSON.parse(nextState)).toEqual({ gold: 2, silver: 1 });
  });

  it('never notifies or lowers the watermark on a decrease (flap safety)', () => {
    const stored = JSON.stringify({ gold: 3 });
    const dip = diffDispenserRewards(stored, { gold: 1 });
    expect(dip.newSlots).toEqual([]);
    expect(JSON.parse(dip.nextState)).toEqual({ gold: 3 });

    // Recovery to the previous count must not re-fire either.
    const recovered = diffDispenserRewards(dip.nextState, { gold: 3 });
    expect(recovered.newSlots).toEqual([]);
  });

  it('keeps disappeared tiers in the watermark while notifying new tiers', () => {
    const { newSlots, nextState } = diffDispenserRewards(
      JSON.stringify({ ended: 2 }),
      { fresh: 1 }
    );
    expect(newSlots).toEqual([{ tier: 'fresh', count: 1 }]);
    expect(JSON.parse(nextState)).toEqual({ ended: 2, fresh: 1 });
  });

  it('detects override slot grants', () => {
    const { newSlots } = diffDispenserRewards(JSON.stringify({ __override: 1 }), {
      __override: 2,
    });
    expect(newSlots).toEqual([{ tier: '__override', count: 1 }]);
  });

  it('baseline of zero slots (404) then a first reward notifies', () => {
    const baseline = diffDispenserRewards(null, {});
    expect(baseline.newSlots).toEqual([]);
    const earned = diffDispenserRewards(baseline.nextState, { gold: 1 });
    expect(earned.newSlots).toEqual([{ tier: 'gold', count: 1 }]);
  });
});
