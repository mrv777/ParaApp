/**
 * D1 queries for chat, following the prepared-statement style in `../db.ts`.
 *
 * NOTE on time units: chat_messages.created_at is stored in **milliseconds**
 * (Date.now()), not seconds like the other tables. This matches the WS `ts`
 * field and gives sub-second ordering for the history cursor. The retention
 * cron must therefore prune with a millisecond threshold.
 */

import type { ChatMessage, ChatReplyQuote, ReactionSummary } from './protocol';
import {
  isReactionEmoji,
  replyPreview,
  truncateChatAddress,
} from './protocol';

interface HistoryRow {
  id: string;
  address: string;
  body: string;
  created_at: number;
  nickname: string | null;
  official: number | null;
  reply_to: string | null;
}

export async function insertChatMessage(
  db: D1Database,
  message: {
    id: string;
    address: string;
    body: string;
    createdAt: number;
    replyTo?: string | null;
  }
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO chat_messages (id, address, body, created_at, reply_to) VALUES (?, ?, ?, ?, ?)'
    )
    .bind(
      message.id,
      message.address,
      message.body,
      message.createdAt,
      message.replyTo ?? null
    )
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
      `SELECT m.id, m.address, m.body, m.created_at, m.reply_to, p.nickname, p.official
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
    ...(row.reply_to ? { replyToId: row.reply_to } : {}),
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

  // Hydrate reply quotes: batch-fetch the referenced parents (filtered for the
  // viewer's blocks + soft-deletes). A parent that doesn't resolve leaves
  // replyToId set with no quote — the client shows an "unavailable" placeholder.
  const parentIds = messages
    .map((m) => m.replyToId)
    .filter((id): id is string => !!id);
  if (parentIds.length) {
    const quotes = await getReplyParents(db, parentIds, opts.address ?? '');
    for (const message of messages) {
      if (!message.replyToId) continue;
      const quote = quotes.get(message.replyToId);
      if (quote) message.replyTo = quote;
    }
  }
  return messages;
}

interface ReplyParentRow {
  id: string;
  address: string;
  body: string;
  nickname: string | null;
}

/** Build the display quote for a resolved parent row. */
function toReplyQuote(row: {
  address: string;
  body: string;
  nickname: string | null;
}): ChatReplyQuote {
  return {
    senderDisplay: row.nickname ?? truncateChatAddress(row.address),
    senderKey: truncateChatAddress(row.address),
    textPreview: replyPreview(row.body),
  };
}

/**
 * Batch-resolve reply-parent quotes for a set of parent ids. Skips soft-deleted
 * parents and — when `viewerAddress` is supplied — parents from senders the
 * viewer has blocked, so a blocked user's text never leaks through someone
 * else's reply. Ids that don't resolve are simply absent from the map.
 */
export async function getReplyParents(
  db: D1Database,
  parentIds: string[],
  viewerAddress: string
): Promise<Map<string, ChatReplyQuote>> {
  const byId = new Map<string, ChatReplyQuote>();
  const unique = [...new Set(parentIds)];
  if (unique.length === 0) return byId;

  for (let i = 0; i < unique.length; i += REACTION_QUERY_CHUNK) {
    const chunk = unique.slice(i, i + REACTION_QUERY_CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    const conditions = [`m.id IN (${placeholders})`, 'm.deleted = 0'];
    const binds: unknown[] = [...chunk];
    if (viewerAddress) {
      conditions.push(
        'm.address NOT IN (SELECT blocked FROM chat_blocks WHERE blocker = ?)'
      );
      binds.push(viewerAddress);
    }
    const { results } = await db
      .prepare(
        `SELECT m.id, m.address, m.body, p.nickname
         FROM chat_messages m
         LEFT JOIN chat_profiles p ON p.address = m.address
         WHERE ${conditions.join(' AND ')}`
      )
      .bind(...binds)
      .all<ReplyParentRow>();
    for (const row of results) {
      byId.set(row.id, toReplyQuote(row));
    }
  }
  return byId;
}

/**
 * Resolve a single reply-parent quote (used on the live send path). Same
 * deleted/blocked rules as getReplyParents. Returns null when unresolved.
 */
export async function getReplyParent(
  db: D1Database,
  parentId: string,
  viewerAddress: string
): Promise<ChatReplyQuote | null> {
  const quotes = await getReplyParents(db, [parentId], viewerAddress);
  return quotes.get(parentId) ?? null;
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
  // A temp ban whose expires_at has passed is treated as lifted (the row lingers
  // until the retention cron reaps it). NULL expires_at = permanent.
  const row = await db
    .prepare(
      'SELECT 1 FROM chat_bans WHERE address = ? AND (expires_at IS NULL OR expires_at > unixepoch())'
    )
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

export interface ChatProfileRow {
  address: string;
  nickname: string;
  official: boolean;
  updated_at: number;
}

/**
 * Assigned handles (rows with a nickname), newest first — powers the admin
 * Nicknames tab. Rows with a null nickname are cleared handles and excluded.
 */
export async function listProfiles(
  db: D1Database,
  opts: { limit?: number } = {}
): Promise<ChatProfileRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const { results } = await db
    .prepare(
      `SELECT address, nickname, official, updated_at
       FROM chat_profiles
       WHERE nickname IS NOT NULL
       ORDER BY updated_at DESC, address ASC
       LIMIT ?`
    )
    .bind(limit)
    .all<{
      address: string;
      nickname: string;
      official: number | null;
      updated_at: number;
    }>();
  return results.map((r) => ({
    address: r.address,
    nickname: r.nickname,
    official: r.official === 1,
    updated_at: r.updated_at,
  }));
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

export interface BlockedUserRow {
  address: string;
  nickname: string | null;
  official: boolean;
  createdAt: number;
}

export async function getBlockedUsers(
  db: D1Database,
  blocker: string
): Promise<BlockedUserRow[]> {
  const { results } = await db
    .prepare(
      `SELECT b.blocked AS address, b.created_at, p.nickname, p.official
       FROM chat_blocks b
       LEFT JOIN chat_profiles p ON p.address = b.blocked
       WHERE b.blocker = ?
       ORDER BY b.created_at DESC, b.blocked ASC`
    )
    .bind(blocker)
    .all<{
      address: string;
      created_at: number;
      nickname: string | null;
      official: number | null;
    }>();
  return results.map((row) => ({
    address: row.address,
    nickname: row.nickname ?? null,
    official: row.official === 1,
    createdAt: row.created_at,
  }));
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
  reason: string,
  expiresAt: number | null = null
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO chat_bans (address, reason, expires_at) VALUES (?, ?, ?)
       ON CONFLICT(address) DO UPDATE SET reason = excluded.reason, expires_at = excluded.expires_at`
    )
    .bind(address, reason, expiresAt)
    .run();
}

export interface ChatBanRow {
  address: string;
  reason: string | null;
  created_at: number;
  expires_at: number | null; // seconds epoch; null = permanent
}

/** Active bans (expired temp bans excluded), newest first — powers the Bans tab. */
export async function listBans(
  db: D1Database,
  limit = 200
): Promise<ChatBanRow[]> {
  const { results } = await db
    .prepare(
      `SELECT address, reason, created_at, expires_at
       FROM chat_bans
       WHERE expires_at IS NULL OR expires_at > unixepoch()
       ORDER BY created_at DESC, address ASC
       LIMIT ?`
    )
    .bind(Math.min(Math.max(limit, 1), 500))
    .all<ChatBanRow>();
  return results;
}

/** Lift a ban. Returns true only if a row was actually removed. */
export async function removeBan(
  db: D1Database,
  address: string
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM chat_bans WHERE address = ?')
    .bind(address)
    .run();
  return (result.meta?.changes ?? 0) === 1;
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

// ---- Admin search / moderation (Phase 6) -----------------------------------

/** A message row for the admin console (carries the deleted flag; address is
 *  truncated for display, same as public payloads). */
export interface AdminMessage {
  id: string;
  ts: number;
  address: string; // truncated
  nickname: string | null;
  official: boolean;
  body: string;
  deleted: boolean;
}

interface AdminMessageRow {
  id: string;
  address: string;
  body: string;
  created_at: number;
  deleted: number;
  nickname: string | null;
  official: number | null;
}

function toAdminMessage(r: AdminMessageRow): AdminMessage {
  return {
    id: r.id,
    ts: r.created_at,
    address: truncateChatAddress(r.address),
    nickname: r.nickname ?? null,
    official: r.official === 1,
    body: r.body,
    deleted: r.deleted === 1,
  };
}

/**
 * Admin message search: filter by exact sender `address` and/or a `body`
 * substring, page back with `before`/`beforeId`, and optionally include
 * soft-deleted rows (for review / undelete). Newest-first, no block filtering
 * (admins see everything). Deliberately skips reaction/reply hydration.
 */
export async function searchMessages(
  db: D1Database,
  opts: {
    address?: string;
    q?: string;
    before?: number;
    beforeId?: string;
    limit: number;
    includeDeleted?: boolean;
  }
): Promise<AdminMessage[]> {
  const limit = Math.min(Math.max(Math.floor(opts.limit) || 50, 1), 100);
  const conditions: string[] = [];
  const binds: unknown[] = [];
  if (!opts.includeDeleted) conditions.push('m.deleted = 0');
  if (opts.address) {
    conditions.push('m.address = ?');
    binds.push(opts.address);
  }
  if (opts.q) {
    // Escape LIKE wildcards so a literal % / _ in the query isn't treated as one.
    const needle = opts.q.replace(/[\\%_]/g, '\\$&');
    conditions.push("m.body LIKE ? ESCAPE '\\'");
    binds.push('%' + needle + '%');
  }
  if (opts.before) {
    if (opts.beforeId) {
      conditions.push('(m.created_at < ? OR (m.created_at = ? AND m.id < ?))');
      binds.push(opts.before, opts.before, opts.beforeId);
    } else {
      conditions.push('m.created_at < ?');
      binds.push(opts.before);
    }
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  binds.push(limit);
  const { results } = await db
    .prepare(
      `SELECT m.id, m.address, m.body, m.created_at, m.deleted, p.nickname, p.official
       FROM chat_messages m
       LEFT JOIN chat_profiles p ON p.address = m.address
       ${where}
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT ?`
    )
    .bind(...binds)
    .all<AdminMessageRow>();
  return results.map(toAdminMessage);
}

/** Fetch one message (including deleted) for the admin preview/undelete flow. */
export async function getAdminMessage(
  db: D1Database,
  messageId: string
): Promise<AdminMessage | null> {
  const r = await db
    .prepare(
      `SELECT m.id, m.address, m.body, m.created_at, m.deleted, p.nickname, p.official
       FROM chat_messages m
       LEFT JOIN chat_profiles p ON p.address = m.address
       WHERE m.id = ?`
    )
    .bind(messageId)
    .first<AdminMessageRow>();
  return r ? toAdminMessage(r) : null;
}

/**
 * Soft-delete every live message from an address (admin ban-purge) and reap
 * their reactions. Returns the ids removed so the caller can broadcast a delete
 * for each, dropping them from live sockets without a reload.
 */
export async function deleteAllFromAddress(
  db: D1Database,
  address: string
): Promise<string[]> {
  const { results } = await db
    .prepare('SELECT id FROM chat_messages WHERE address = ? AND deleted = 0')
    .bind(address)
    .all<{ id: string }>();
  const ids = results.map((r) => r.id);
  if (!ids.length) return [];
  await db
    .prepare('UPDATE chat_messages SET deleted = 1 WHERE address = ? AND deleted = 0')
    .bind(address)
    .run();
  await db
    .prepare(
      'DELETE FROM chat_reactions WHERE message_id IN (SELECT id FROM chat_messages WHERE address = ?)'
    )
    .bind(address)
    .run();
  return ids;
}

/**
 * Restore a soft-deleted message. Returns true only if a deleted row was
 * actually flipped back. Reactions are not restored (they were reaped on
 * delete); live clients reconcile on their next history fetch (no un-delete
 * broadcast exists).
 */
export async function undeleteMessage(
  db: D1Database,
  messageId: string
): Promise<boolean> {
  const result = await db
    .prepare('UPDATE chat_messages SET deleted = 0 WHERE id = ? AND deleted = 1')
    .bind(messageId)
    .run();
  return (result.meta?.changes ?? 0) === 1;
}

// ---- Audit trail ------------------------------------------------------------

export interface ChatAuditRow {
  id: string;
  action: string;
  target: string | null;
  detail: string | null;
  created_at: number;
}

/** Record one mutating admin action for the audit trail. */
export async function addAuditEntry(
  db: D1Database,
  entry: { action: string; target?: string | null; detail?: string | null }
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO chat_admin_audit (id, action, target, detail) VALUES (?, ?, ?, ?)'
    )
    .bind(
      crypto.randomUUID(),
      entry.action,
      entry.target ?? null,
      entry.detail ?? null
    )
    .run();
}

/** Recent admin actions, newest first — powers the Audit tab. */
export async function listAudit(
  db: D1Database,
  limit = 100
): Promise<ChatAuditRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, action, target, detail, created_at
       FROM chat_admin_audit
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .bind(Math.min(Math.max(limit, 1), 500))
    .all<ChatAuditRow>();
  return results;
}

/** Reap temp bans whose expiry has passed (isBanned already ignores them). */
export async function pruneExpiredBans(db: D1Database): Promise<number> {
  const result = await db
    .prepare(
      'DELETE FROM chat_bans WHERE expires_at IS NOT NULL AND expires_at <= unixepoch()'
    )
    .run();
  return result.meta?.changes ?? 0;
}

/** Bound audit-log growth: drop entries older than the seconds-epoch cutoff. */
export async function pruneAuditLog(
  db: D1Database,
  olderThanSec: number
): Promise<number> {
  const result = await db
    .prepare('DELETE FROM chat_admin_audit WHERE created_at < ?')
    .bind(olderThanSec)
    .run();
  return result.meta?.changes ?? 0;
}
