/**
 * D1 queries for chat, following the prepared-statement style in `../db.ts`.
 *
 * NOTE on time units: chat_messages.created_at is stored in **milliseconds**
 * (Date.now()), not seconds like the other tables. This matches the WS `ts`
 * field and gives sub-second ordering for the history cursor. The retention
 * cron must therefore prune with a millisecond threshold.
 */

import type { ChatMessage } from './protocol';

interface HistoryRow {
  id: string;
  address: string;
  body: string;
  created_at: number;
  nickname: string | null;
}

export async function insertChatMessage(
  db: D1Database,
  message: { id: string; address: string; body: string; createdAt: number }
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO chat_messages (id, address, body, created_at) VALUES (?, ?, ?, ?)'
    )
    .bind(message.id, message.address, message.body, message.createdAt)
    .run();
}

/**
 * Most-recent-first page of non-deleted messages. `before` is an exclusive
 * millisecond cursor (pass the oldest `ts` you already have to page back).
 */
export async function getRecentMessages(
  db: D1Database,
  opts: { before?: number; limit: number }
): Promise<ChatMessage[]> {
  const limit = Math.min(Math.max(Math.floor(opts.limit) || 50, 1), 100);

  const query = opts.before
    ? db
        .prepare(
          `SELECT m.id, m.address, m.body, m.created_at, p.nickname
           FROM chat_messages m
           LEFT JOIN chat_profiles p ON p.address = m.address
           WHERE m.deleted = 0 AND m.created_at < ?
           ORDER BY m.created_at DESC
           LIMIT ?`
        )
        .bind(opts.before, limit)
    : db
        .prepare(
          `SELECT m.id, m.address, m.body, m.created_at, p.nickname
           FROM chat_messages m
           LEFT JOIN chat_profiles p ON p.address = m.address
           WHERE m.deleted = 0
           ORDER BY m.created_at DESC
           LIMIT ?`
        )
        .bind(limit);

  const { results } = await query.all<HistoryRow>();
  return results.map((row) => ({
    id: row.id,
    ts: row.created_at,
    address: row.address,
    nickname: row.nickname ?? null,
    body: row.body,
  }));
}

export async function isBanned(
  db: D1Database,
  address: string
): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 FROM chat_bans WHERE address = ?')
    .bind(address)
    .first();
  return row !== null;
}
