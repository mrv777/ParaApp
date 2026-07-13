import { describe, expect, it } from 'vitest';

import { buildCronSummary, getUserRotationOffset } from './cron';

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
