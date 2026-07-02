/**
 * D1 queries for chat, following the prepared-statement style in `../db.ts`.
 *
 * NOTE on time units: chat_messages.created_at is stored in **milliseconds**
 * (Date.now()), not seconds like the other tables. This matches the WS `ts`
 * field and gives sub-second ordering for the history cursor. The retention
 * cron must therefore prune with a millisecond threshold.
 */

import type { ChatMessage, ReactionSummary } from './protocol';
import { isReactionEmoji } from './protocol';

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
  opts: { before?: number; limit: number; address?: string }
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
  const messages: ChatMessage[] = results.map((row) => ({
    id: row.id,
    ts: row.created_at,
    address: row.address,
    nickname: row.nickname ?? null,
    body: row.body,
  }));

  // Attach reaction summaries (with `mine` when an address is supplied).
  const reactions = await getReactionsForMessages(
    db,
    messages.map((m) => m.id),
    opts.address ?? ''
  );
  for (const message of messages) {
    const summary = reactions.get(message.id);
    if (summary && summary.length) message.reactions = summary;
  }
  return messages;
}

// ============================================================================
// Reactions (Phase 3)
// ============================================================================

/** Returns true only if the reaction was newly added (idempotent). */
export async function addReaction(
  db: D1Database,
  messageId: string,
  address: string,
  emoji: string
): Promise<boolean> {
  const result = await db
    .prepare(
      'INSERT OR IGNORE INTO chat_reactions (message_id, address, emoji) VALUES (?, ?, ?)'
    )
    .bind(messageId, address, emoji)
    .run();
  return (result.meta?.changes ?? 0) === 1;
}

/** Returns true only if a reaction was actually removed. */
export async function removeReaction(
  db: D1Database,
  messageId: string,
  address: string,
  emoji: string
): Promise<boolean> {
  const result = await db
    .prepare(
      'DELETE FROM chat_reactions WHERE message_id = ? AND address = ? AND emoji = ?'
    )
    .bind(messageId, address, emoji)
    .run();
  return (result.meta?.changes ?? 0) === 1;
}

export async function getReactionCount(
  db: D1Database,
  messageId: string,
  emoji: string
): Promise<number> {
  const row = await db
    .prepare(
      'SELECT COUNT(*) AS count FROM chat_reactions WHERE message_id = ? AND emoji = ?'
    )
    .bind(messageId, emoji)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

/**
 * Aggregate reactions for a set of messages. `address` flags which the caller
 * reacted to (pass '' to skip). One grouped query for the whole page.
 */
export async function getReactionsForMessages(
  db: D1Database,
  messageIds: string[],
  address: string
): Promise<Map<string, ReactionSummary[]>> {
  const byMessage = new Map<string, ReactionSummary[]>();
  if (messageIds.length === 0) return byMessage;

  const placeholders = messageIds.map(() => '?').join(',');
  const { results } = await db
    .prepare(
      `SELECT message_id, emoji, COUNT(*) AS count,
         MAX(CASE WHEN address = ? THEN 1 ELSE 0 END) AS mine
       FROM chat_reactions
       WHERE message_id IN (${placeholders})
       GROUP BY message_id, emoji`
    )
    .bind(address, ...messageIds)
    .all<{ message_id: string; emoji: string; count: number; mine: number }>();

  for (const row of results) {
    if (!isReactionEmoji(row.emoji)) continue; // ignore any legacy/off-set rows
    const list = byMessage.get(row.message_id) ?? [];
    list.push({ emoji: row.emoji, count: row.count, mine: row.mine === 1 });
    byMessage.set(row.message_id, list);
  }
  return byMessage;
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
