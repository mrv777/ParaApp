/**
 * D1 queries for chat, following the prepared-statement style in `../db.ts`.
 *
 * NOTE on time units: chat_messages.created_at is stored in **milliseconds**
 * (Date.now()), not seconds like the other tables. This matches the WS `ts`
 * field and gives sub-second ordering for the history cursor. The retention
 * cron must therefore prune with a millisecond threshold.
 */

import type { ChatMessage, ReactionSummary } from './protocol';
import { isReactionEmoji, truncateChatAddress } from './protocol';

interface HistoryRow {
  id: string;
  address: string;
  body: string;
  created_at: number;
  nickname: string | null;
  official: number | null;
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
 * millisecond cursor (pass the oldest `ts` you already have to page back);
 * `beforeId` tie-breaks messages sharing that millisecond so none are skipped
 * at a page boundary (ordering is created_at DESC, id DESC).
 */
export async function getRecentMessages(
  db: D1Database,
  opts: { before?: number; beforeId?: string; limit: number; address?: string }
): Promise<ChatMessage[]> {
  const limit = Math.min(Math.max(Math.floor(opts.limit) || 50, 1), 100);

  // Build conditions dynamically: never return deleted messages; optionally page
  // back with `before`; and (server-enforced) drop senders the caller blocked.
  const conditions = ['m.deleted = 0'];
  const binds: unknown[] = [];
  if (opts.before) {
    if (opts.beforeId) {
      conditions.push('(m.created_at < ? OR (m.created_at = ? AND m.id < ?))');
      binds.push(opts.before, opts.before, opts.beforeId);
    } else {
      conditions.push('m.created_at < ?');
      binds.push(opts.before);
    }
  }
  if (opts.address) {
    conditions.push(
      'm.address NOT IN (SELECT blocked FROM chat_blocks WHERE blocker = ?)'
    );
    binds.push(opts.address);
  }
  binds.push(limit);

  const { results } = await db
    .prepare(
      `SELECT m.id, m.address, m.body, m.created_at, p.nickname, p.official
       FROM chat_messages m
       LEFT JOIN chat_profiles p ON p.address = m.address
       WHERE ${conditions.join(' AND ')}
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT ?`
    )
    .bind(...binds)
    .all<HistoryRow>();
  const messages: ChatMessage[] = results.map((row) => ({
    id: row.id,
    ts: row.created_at,
    // Public payloads carry only the truncated sender key — full addresses
    // must not leave the server (see truncateChatAddress in protocol.ts).
    address: truncateChatAddress(row.address),
    nickname: row.nickname ?? null,
    official: row.official === 1,
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

/**
 * Returns true only if the reaction was newly added (idempotent). Guarded so a
 * react targeting a nonexistent or soft-deleted message is a silent no-op —
 * without the EXISTS check a tokened client could mint orphan rows for arbitrary
 * UUIDs, and the retention prune (which joins on chat_messages) never reaps them.
 */
export async function addReaction(
  db: D1Database,
  messageId: string,
  address: string,
  emoji: string
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO chat_reactions (message_id, address, emoji)
       SELECT ?1, ?2, ?3
       WHERE EXISTS (SELECT 1 FROM chat_messages WHERE id = ?1 AND deleted = 0)`
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

// D1 caps bound parameters at 100 per query; each chunk binds `address` + ids.
const REACTION_QUERY_CHUNK = 99;

/**
 * Aggregate reactions for a set of messages. `address` flags which the caller
 * reacted to (pass '' to skip). One grouped query per chunk of 99 ids.
 */
export async function getReactionsForMessages(
  db: D1Database,
  messageIds: string[],
  address: string
): Promise<Map<string, ReactionSummary[]>> {
  const byMessage = new Map<string, ReactionSummary[]>();
  if (messageIds.length === 0) return byMessage;

  for (let i = 0; i < messageIds.length; i += REACTION_QUERY_CHUNK) {
    const chunk = messageIds.slice(i, i + REACTION_QUERY_CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    const { results } = await db
      .prepare(
        `SELECT message_id, emoji, COUNT(*) AS count,
           MAX(CASE WHEN address = ? THEN 1 ELSE 0 END) AS mine
         FROM chat_reactions
         WHERE message_id IN (${placeholders})
         GROUP BY message_id, emoji`
      )
      .bind(address, ...chunk)
      .all<{ message_id: string; emoji: string; count: number; mine: number }>();

    for (const row of results) {
      if (!isReactionEmoji(row.emoji)) continue; // ignore any legacy/off-set rows
      const list = byMessage.get(row.message_id) ?? [];
      list.push({ emoji: row.emoji, count: row.count, mine: row.mine === 1 });
      byMessage.set(row.message_id, list);
    }
  }
  return byMessage;
}

/**
 * Retention prune: delete chat messages older than the cutoff and cascade to
 * their reactions. chat_messages.created_at is MILLISECONDS, so pass a ms
 * threshold. Returns the number of messages deleted. Cheap when nothing is due
 * (created_at is indexed), so it's safe to run every cron tick.
 */
export async function pruneChatMessages(
  db: D1Database,
  olderThanMs: number
): Promise<number> {
  await db
    .prepare(
      'DELETE FROM chat_reactions WHERE message_id IN (SELECT id FROM chat_messages WHERE created_at < ?)'
    )
    .bind(olderThanMs)
    .run();
  const result = await db
    .prepare('DELETE FROM chat_messages WHERE created_at < ?')
    .bind(olderThanMs)
    .run();
  return result.meta?.changes ?? 0;
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

// ============================================================================
// Profiles / nicknames (Phase 4)
// ============================================================================

export interface ChatProfile {
  /** Display nickname, or null to fall back to the truncated address. */
  nickname: string | null;
  /** True when the handle was assigned by an admin (locked, rendered with a marker). */
  official: boolean;
}

export async function getProfile(
  db: D1Database,
  address: string
): Promise<ChatProfile> {
  const row = await db
    .prepare('SELECT nickname, official FROM chat_profiles WHERE address = ?')
    .bind(address)
    .first<{ nickname: string | null; official: number | null }>();
  return { nickname: row?.nickname ?? null, official: row?.official === 1 };
}

/** The address currently holding a given norm key, or null. Used to enforce
 *  nickname uniqueness (no two addresses may share a folded key). */
export async function nicknameOwner(
  db: D1Database,
  norm: string
): Promise<string | null> {
  if (!norm) return null;
  const row = await db
    .prepare('SELECT address FROM chat_profiles WHERE norm = ?')
    .bind(norm)
    .first<{ address: string }>();
  return row?.address ?? null;
}

/**
 * Upsert a nickname, or clear it (fall back to truncated address) when null.
 * `norm` is the caller-supplied canonical uniqueness key (from nicknameKey());
 * pass '' to store NULL (name has no alphabetic content). `official` marks an
 * admin-assigned, locked handle.
 */
export async function setNickname(
  db: D1Database,
  address: string,
  nickname: string | null,
  opts: { norm?: string; official?: boolean } = {}
): Promise<void> {
  if (nickname === null) {
    await db
      .prepare('DELETE FROM chat_profiles WHERE address = ?')
      .bind(address)
      .run();
    return;
  }
  const norm = opts.norm && opts.norm.length ? opts.norm : null;
  const official = opts.official ? 1 : 0;
  await db
    .prepare(
      `INSERT INTO chat_profiles (address, nickname, norm, official, updated_at)
       VALUES (?, ?, ?, ?, unixepoch())
       ON CONFLICT(address) DO UPDATE SET
         nickname = excluded.nickname,
         norm = excluded.norm,
         official = excluded.official,
         updated_at = unixepoch()`
    )
    .bind(address, nickname, norm, official)
    .run();
}

// ============================================================================
// Blocks / reports / EULA (Phase 5)
// ============================================================================

/** Addresses this blocker has blocked (used to filter their inbound messages). */
export async function getBlockedBy(
  db: D1Database,
  blocker: string
): Promise<string[]> {
  const { results } = await db
    .prepare('SELECT blocked FROM chat_blocks WHERE blocker = ?')
    .bind(blocker)
    .all<{ blocked: string }>();
  return results.map((r) => r.blocked);
}

export async function addBlock(
  db: D1Database,
  blocker: string,
  blocked: string
): Promise<void> {
  await db
    .prepare(
      'INSERT OR IGNORE INTO chat_blocks (blocker, blocked) VALUES (?, ?)'
    )
    .bind(blocker, blocked)
    .run();
}

export async function removeBlock(
  db: D1Database,
  blocker: string,
  blocked: string
): Promise<void> {
  await db
    .prepare('DELETE FROM chat_blocks WHERE blocker = ? AND blocked = ?')
    .bind(blocker, blocked)
    .run();
}

/**
 * Queue a report. Returns false (no insert) when the target message doesn't
 * exist or is already soft-deleted — same orphan-row guard as addReaction.
 */
/**
 * Full sender address of a message (blocking works by messageId because
 * clients only ever see truncated addresses). Soft-deleted messages still
 * resolve — blocking the sender of a just-moderated message is legitimate.
 */
export async function getMessageSender(
  db: D1Database,
  messageId: string
): Promise<string | null> {
  const row = await db
    .prepare('SELECT address FROM chat_messages WHERE id = ?')
    .bind(messageId)
    .first<{ address: string }>();
  return row?.address ?? null;
}

export async function addReport(
  db: D1Database,
  report: { id: string; messageId: string; reporter: string; reason: string }
): Promise<boolean> {
  // OR IGNORE + idx_chat_reports_unique: one row per (message, reporter), so
  // repeat reports can't flood the admin queue. A duplicate is idempotent
  // success — only a missing/deleted message is a failure.
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO chat_reports (id, message_id, reporter, reason)
       SELECT ?1, ?2, ?3, ?4
       WHERE EXISTS (SELECT 1 FROM chat_messages WHERE id = ?2 AND deleted = 0)`
    )
    .bind(report.id, report.messageId, report.reporter, report.reason)
    .run();
  if ((result.meta?.changes ?? 0) === 1) return true;
  const dup = await db
    .prepare('SELECT 1 FROM chat_reports WHERE message_id = ? AND reporter = ?')
    .bind(report.messageId, report.reporter)
    .first();
  return dup !== null;
}

/** Current admin announcement banner text (null = none). */
export async function getAnnouncement(db: D1Database): Promise<string | null> {
  const row = await db
    .prepare('SELECT body FROM chat_announcement WHERE id = 1')
    .first<{ body: string | null }>();
  return row?.body ?? null;
}

/** Set or clear (null) the announcement banner. */
export async function setAnnouncement(
  db: D1Database,
  body: string | null
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO chat_announcement (id, body, updated_at)
       VALUES (1, ?, unixepoch())
       ON CONFLICT(id) DO UPDATE SET body = excluded.body, updated_at = unixepoch()`
    )
    .bind(body)
    .run();
}

export async function recordEulaAcceptance(
  db: D1Database,
  address: string,
  version: string
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO chat_eula_accept (address, version, accepted_at)
       VALUES (?, ?, unixepoch())
       ON CONFLICT(address) DO UPDATE SET
         version = excluded.version,
         accepted_at = unixepoch()`
    )
    .bind(address, version)
    .run();
}

// ============================================================================
// Admin (Phase 5) — guarded by ADMIN_SECRET at the route layer
// ============================================================================

export async function softDeleteMessage(
  db: D1Database,
  messageId: string
): Promise<boolean> {
  const result = await db
    .prepare('UPDATE chat_messages SET deleted = 1 WHERE id = ?')
    .bind(messageId)
    .run();
  const deleted = (result.meta?.changes ?? 0) === 1;
  // Reap the message's reactions now rather than leaving them to linger until
  // the retention prune. They're already hidden (history skips deleted rows),
  // so this is purely housekeeping — but keeps chat_reactions free of orphans.
  if (deleted) {
    await db
      .prepare('DELETE FROM chat_reactions WHERE message_id = ?')
      .bind(messageId)
      .run();
  }
  return deleted;
}

export async function banAddress(
  db: D1Database,
  address: string,
  reason: string
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO chat_bans (address, reason) VALUES (?, ?)
       ON CONFLICT(address) DO UPDATE SET reason = excluded.reason`
    )
    .bind(address, reason)
    .run();
}

export interface ChatReportRow {
  id: string;
  message_id: string;
  reporter: string;
  reason: string | null;
  created_at: number;
  resolved: number;
  body: string | null; // joined message body (null if hard-deleted)
  message_address: string | null; // joined sender
}

/** Open (unresolved) reports, newest first, joined to the reported message. */
export async function getOpenReports(
  db: D1Database,
  limit = 100
): Promise<ChatReportRow[]> {
  const { results } = await db
    .prepare(
      `SELECT r.id, r.message_id, r.reporter, r.reason, r.created_at, r.resolved,
              m.body AS body, m.address AS message_address
       FROM chat_reports r
       LEFT JOIN chat_messages m ON m.id = r.message_id
       WHERE r.resolved = 0
       ORDER BY r.created_at DESC
       LIMIT ?`
    )
    .bind(Math.min(Math.max(limit, 1), 500))
    .all<ChatReportRow>();
  return results;
}

export async function resolveReport(
  db: D1Database,
  reportId: string
): Promise<boolean> {
  const result = await db
    .prepare('UPDATE chat_reports SET resolved = 1 WHERE id = ?')
    .bind(reportId)
    .run();
  return (result.meta?.changes ?? 0) === 1;
}
