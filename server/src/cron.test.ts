import { describe, expect, it } from 'vitest';

import {
  buildCronSummary,
  buildDispenserCounts,
  diffDispenserRewards,
  getUserRotationOffset,
  shouldCheckDispenser,
  stepWorkerStatus,
} from './cron';
import type { WorkerStatusEntry } from './types';

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
  it('counts assigned inscriptions per tier, including the override tier', () => {
    expect(
      buildDispenserCounts({
        assigned_inscription_ids: {
          gold: ['a', 'b'],
          silver: ['c'],
          empty: [],
          override: ['d'],
        },
      })
    ).toEqual({ gold: 2, silver: 1, override: 1 });
  });

  it('returns empty counts for an empty payload', () => {
    expect(buildDispenserCounts({})).toEqual({});
    expect(buildDispenserCounts({ assigned_inscription_ids: {} })).toEqual({});
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

  it('detects newly assigned override-tier grants', () => {
    const { newSlots } = diffDispenserRewards(JSON.stringify({ override: 1 }), {
      override: 2,
    });
    expect(newSlots).toEqual([{ tier: 'override', count: 1 }]);
  });

  it('baseline of zero slots (404) then a first reward notifies', () => {
    const baseline = diffDispenserRewards(null, {});
    expect(baseline.newSlots).toEqual([]);
    const earned = diffDispenserRewards(baseline.nextState, { gold: 1 });
    expect(earned.newSlots).toEqual([{ tier: 'gold', count: 1 }]);
  });
});

// ---------------------------------------------------------------------------
// Flap cooldown state machine
// ---------------------------------------------------------------------------

const NOW = 1_787_000_000;
const HOUR = 3600;

/** Run consecutive ticks (1/min) through stepWorkerStatus, returning notifications. */
function runTicks(
  start: WorkerStatusEntry | undefined,
  ticks: { stale: boolean; minutes?: number }[],
  startAt = NOW
): { entry: WorkerStatusEntry; events: string[] } {
  let entry = start;
  let at = startAt;
  const events: string[] = [];
  for (const tick of ticks) {
    at += (tick.minutes ?? 1) * 60;
    const step = stepWorkerStatus(entry, tick.stale, at);
    entry = step.next;
    if (step.notify) events.push(`${step.notify}@${(at - startAt) / 60}m`);
  }
  return { entry: entry!, events };
}

const staleTicks = (n: number) =>
  Array.from({ length: n }, () => ({ stale: true }));

describe('stepWorkerStatus', () => {
  it('notifies a plain offline→online pair exactly once', () => {
    const { entry, events } = runTicks(undefined, [
      ...staleTicks(7),
      { stale: false },
    ]);
    expect(events).toEqual(['offline@5m', 'online@8m']);
    expect(entry.notifiedOffline).toBe(false);
    expect(entry.cooldownUntil).toBeGreaterThan(NOW);
  });

  it('handles legacy entries without the new fields', () => {
    const legacy = { offlineChecks: 4, notifiedOffline: false };
    const step = stepWorkerStatus(legacy, true, NOW);
    expect(step.notify).toBe('offline');
    expect(step.next).toEqual({ offlineChecks: 5, notifiedOffline: true });
  });

  it('absorbs a full flap pair inside the cooldown', () => {
    // Pair 1 notifies, then a second outage 10 min later recovers again.
    const { events } = runTicks(undefined, [
      ...staleTicks(5),
      { stale: false },
      { stale: false, minutes: 10 },
      ...staleTicks(5),
      { stale: false },
    ]);
    expect(events).toEqual(['offline@5m', 'online@6m']);
  });

  it('sends a late offline alert when a suppressed outage outlives the cooldown', () => {
    const { events } = runTicks(undefined, [
      ...staleTicks(5),
      { stale: false }, // online@6m starts the 90m cooldown
      ...staleTicks(5), // crossing at 11m suppressed
      { stale: true, minutes: 90 }, // past expiry
    ]);
    expect(events).toEqual(['offline@5m', 'online@6m', 'offline@101m']);
  });

  it('slides the cooldown so sustained flapping stays silent until stable', () => {
    // Flap every ~30 min for 4 cycles after the first pair: only pair 1 notifies.
    const cycle = [...staleTicks(5), { stale: false, minutes: 25 }];
    const { entry, events } = runTicks(undefined, [
      ...cycle,
      ...cycle,
      ...cycle,
      ...cycle,
    ]);
    expect(events).toEqual(['offline@5m', 'online@30m']);
    // Still armed: cooldown extends past the last recovery.
    expect(entry.cooldownUntil).toBeGreaterThan(NOW + 90 * 60);
  });

  it('keeps the cooldown while online and drops it after expiry', () => {
    const armed = stepWorkerStatus(
      { offlineChecks: 0, notifiedOffline: true },
      false,
      NOW
    ).next;
    const during = stepWorkerStatus(armed, false, NOW + HOUR).next;
    expect(during.cooldownUntil).toBe(armed.cooldownUntil);
    const after = stepWorkerStatus(armed, false, NOW + 2 * HOUR).next;
    expect(after.cooldownUntil).toBeUndefined();
  });

  it('a fresh outage after a stable cooldown expiry notifies normally', () => {
    const { events } = runTicks(undefined, [
      ...staleTicks(5),
      { stale: false },
      { stale: false, minutes: 95 }, // stable past cooldown
      ...staleTicks(5),
    ]);
    expect(events).toEqual(['offline@5m', 'online@6m', 'offline@106m']);
  });

  it('reports flap suppression for observability', () => {
    const crossing = { offlineChecks: 4, notifiedOffline: false };
    expect(stepWorkerStatus(crossing, true, NOW).suppressed).toBeNull();
    const inCooldown = {
      ...crossing,
      cooldownUntil: NOW + HOUR,
    };
    expect(stepWorkerStatus(inCooldown, true, NOW).suppressed).toBe('flap');
  });

  it('surfaces flapSuppressed in the cron summary', () => {
    const summary = buildCronSummary({ ...healthySummary, flapSuppressed: 3 });
    expect(summary.flapSuppressed).toBe(3);
    expect(summary.warningReasons).toEqual([]);
  });
});

