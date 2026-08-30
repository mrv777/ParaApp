import { describe, expect, it } from 'vitest';

import {
  MaxDevicesExceededError,
  updateSubscriptionPreferences,
  upsertPreferences,
  upsertSubscription,
} from './db';

function recordingDb(changes = 1) {
  const calls: Array<{ sql: string; bindings: unknown[] }> = [];
  const db = {
    prepare: (sql: string) => ({
      bind: (...bindings: unknown[]) => ({
        run: async () => {
          calls.push({ sql, bindings });
          return { meta: { changes } };
        },
      }),
    }),
  } as unknown as D1Database;
  return { db, calls };
}

describe('upsertSubscription', () => {
  it('enforces the device cap in the same statement as the upsert', async () => {
    const { db, calls } = recordingDb();
    await upsertSubscription(db, 'ExponentPushToken[token]', 'bc1qtest', {
      preferences: { blocks: false, workers: true },
      widgetUpdatesEnabled: true,
      notificationsEnabled: false,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('INSERT INTO push_subscriptions');
    expect(calls[0].sql).toContain('SELECT COUNT(*)');
    expect(calls[0].sql).toContain('ON CONFLICT(push_token) DO UPDATE');
    expect(calls[0].bindings).toEqual([
      'ExponentPushToken[token]',
      'bc1qtest',
      1,
      0,
      0,
      1,
      1,
      1,
      'ExponentPushToken[token]',
      'bc1qtest',
      'bc1qtest',
      10,
    ]);
  });

  it('maps a rejected conditional insert to the existing cap error', async () => {
    const { db } = recordingDb(0);
    await expect(
      upsertSubscription(db, 'ExponentPushToken[token]', 'bc1qtest')
    ).rejects.toBeInstanceOf(MaxDevicesExceededError);
  });
});

describe('updateSubscriptionPreferences', () => {
  it('updates one token and preserves omitted fields', async () => {
    const { db, calls } = recordingDb();
    expect(
      await updateSubscriptionPreferences(
        db,
        'ExponentPushToken[token]',
        'bc1qtest',
        { blocks: false, notificationsEnabled: true }
      )
    ).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('WHERE push_token = ? AND btc_address = ?');
    expect(calls[0].bindings).toEqual([
      0,
      null,
      null,
      null,
      null,
      1,
      'ExponentPushToken[token]',
      'bc1qtest',
    ]);
  });
});

describe('upsertPreferences', () => {
  it('uses one atomic upsert and defaults missing fields on insert', async () => {
    const { db, calls } = recordingDb();
    await upsertPreferences(db, 'bc1qtest', {});

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('ON CONFLICT(btc_address) DO UPDATE');
    expect(calls[0].bindings).toEqual([
      'bc1qtest',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('preserves explicit false values and leaves omitted fields untouched', async () => {
    const { db, calls } = recordingDb();
    await upsertPreferences(db, 'bc1qtest', {
      blocks: false,
      bestDiff: true,
      rewards: false,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].bindings).toEqual([
      'bc1qtest',
      0,
      null,
      1,
      0,
      0,
      null,
      1,
      0,
    ]);
  });
});
