import { describe, expect, it } from 'vitest';

import { upsertPreferences } from './db';

function recordingDb() {
  const calls: Array<{ sql: string; bindings: unknown[] }> = [];
  const db = {
    prepare: (sql: string) => ({
      bind: (...bindings: unknown[]) => ({
        run: async () => {
          calls.push({ sql, bindings });
          return { meta: { changes: 1 } };
        },
      }),
    }),
  } as unknown as D1Database;
  return { db, calls };
}

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
