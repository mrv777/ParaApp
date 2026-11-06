import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { URL as NodeURL } from 'node:url';

/** Execute the real D1 SQL against SQLite, rather than mocking SQL semantics. */
export function createTestDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new NodeURL('../../schema.sql', import.meta.url), 'utf8'));
  const db = {
    prepare: (sql: string) => {
      const statement = (...values: (string | number | null)[]) => ({
        run: async () => {
          const result = sqlite.prepare(sql).run(...values);
          return { meta: { changes: Number(result.changes) } };
        },
        first: async () => sqlite.prepare(sql).get(...values) ?? null,
        all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
      });
      return { ...statement(), bind: statement };
    },
  } as unknown as D1Database;
  return { db, sqlite };
}
