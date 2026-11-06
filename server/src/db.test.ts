import { describe, expect, it } from 'vitest';

import {
  updateSubscriptionPreferences,
  upsertPreferences,
  upsertSubscription,
} from './db';
import { createTestDatabase } from './test-utils/sqlite';

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
  it('stores per-device preferences on enrollment', async () => {
    const { db, calls } = recordingDb();
    await upsertSubscription(db, 'ExponentPushToken[token]', 'bc1qtest', {
      preferences: { blocks: false, workers: true },
      widgetUpdatesEnabled: true,
      notificationsEnabled: false,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('INSERT INTO push_subscriptions');
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
    ]);
  });

  it('preserves same-address categories and resets them on address moves', async () => {
    const { db, sqlite } = createTestDatabase();
    try {
      const token = 'ExpoPushToken[device]';
      await upsertSubscription(db, token, 'addressA', { preferences: { workers: false } });
      await upsertSubscription(db, token, 'addressA', { preferences: { workers: true } });
      expect(sqlite.prepare('SELECT notify_workers FROM push_subscriptions').get()?.notify_workers).toBe(0);
      await upsertSubscription(db, token, 'addressB', { preferences: { blocks: false } });
      expect(sqlite.prepare('SELECT btc_address, notify_workers, notify_blocks FROM push_subscriptions').get())
        .toMatchObject({ btc_address: 'addressB', notify_workers: 1, notify_blocks: 0 });
    } finally {
      sqlite.close();
    }
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
