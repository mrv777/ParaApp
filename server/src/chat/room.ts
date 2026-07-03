/**
 * ChatRoom — a single global chat room as a SQLite-backed Durable Object using
 * the WebSocket Hibernation API (an idle room with open sockets isn't billed for
 * duration). One instance, id "global".
 *
 * Reachable only via the worker's /chat/ws route, which validates the session
 * token and forwards the address in the `X-Chat-Address` header (empty for
 * anonymous read-only viewers). The DO trusts that header because the worker
 * always overwrites it and the DO is not reachable any other way.
 */

import type { Env } from '../types';
import type {
  ClientEvent,
  ServerEvent,
  ChatErrorCode,
  ChatReplyQuote,
  ReactionEmoji,
} from './protocol';
import {
  MAX_MESSAGE_LENGTH,
  isReactionEmoji,
  truncateChatAddress,
} from './protocol';
import { stripInvisible } from './sanitize';
import {
  insertChatMessage,
  isBanned,
  addReaction,
  removeReaction,
  getReactionCount,
  getProfile,
  getBlockedBy,
  getReplyParent,
  getMessageSender,
} from './db';
import { isClean, moderateAI } from './moderation';

interface SocketAttachment {
  /** Empty string = anonymous read-only viewer (may not post). */
  address: string;
  /** Addresses this viewer has blocked (loaded on connect; refreshed on reconnect). */
  blocked: string[];
}

/** Matches the v4 UUIDs crypto.randomUUID() mints for message ids. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Collapse whitespace so a message can't be a wall of blank lines: strip
 * per-line trailing spaces and reduce any run of newlines to a single one.
 */
function normalizeBody(raw: string): string {
  return stripInvisible(raw)
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

// Rate limit: 1 message / 1.5s and 10 messages / 60s per address.
const MIN_GAP_MS = 1500;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
// Reactions are cheaper: 250ms min gap, 40 / 60s per address.
const REACT_MIN_GAP_MS = 250;
const REACT_MAX_PER_WINDOW = 40;
// Identity (profile + ban) cache TTL. Removes a per-message getProfile+isBanned
// round-trip; a mid-session nickname/official change or ban self-heals within
// this window (own messages always render as "you" client-side, so the sender
// never sees their own staleness).
const IDENTITY_TTL_MS = 30_000;
// Coalesce presence fan-out to a single trailing broadcast per window, so
// reconnect churn can't turn into an O(N²) send storm.
const PRESENCE_DEBOUNCE_MS = 750;
// Coalesce reaction-count fan-out per (message, emoji) to one broadcast/window:
// a pile-on collapses to a single COUNT query + a single fan-out.
const REACTION_FLUSH_MS = 150;

/** pendingReactions map key — NUL separator can't collide with id/emoji content. */
function reactionKey(messageId: string, emoji: string): string {
  return `${messageId}\u0000${emoji}`;
}

export class ChatRoom {
  private readonly state: DurableObjectState;
  private readonly env: Env;
  /** In-memory recent-action timestamps per address (best-effort; resets on hibernation). */
  private readonly sendLog = new Map<string, number[]>();
  private readonly reactLog = new Map<string, number[]>();
  /** Cached identity (profile + ban) per address; TTL IDENTITY_TTL_MS. */
  private readonly identityCache = new Map<
    string,
    { nickname: string | null; official: boolean; banned: boolean; exp: number }
  >();
  /** Presence debounce: one pending trailing broadcast; last count actually sent. */
  private presenceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastOnline = -1;
  /** Reaction coalescing: pending (message, emoji) keys awaiting a count flush. */
  private readonly pendingReactions = new Map<
    string,
    { messageId: string; emoji: ReactionEmoji }
  >();
  private reactionFlushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    // Free keepalive: the runtime answers "ping" with "pong" without waking the DO.
    this.state.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong')
    );
  }

  async fetch(request: Request): Promise<Response> {
    // Internal, worker-only hook: broadcast an announcement change to all live
    // sockets. Reachable only via the worker (already ADMIN_SECRET-guarded).
    const url = new URL(request.url);
    if (url.pathname === '/internal/announcement' && request.method === 'POST') {
      const { body } = (await request.json()) as { body: string | null };
      this.broadcast({ type: 'announcement', body });
      return new Response(null, { status: 204 });
    }

    // Internal, worker-only hook: a message was deleted (admin moderation) —
    // tell live sockets to drop it so it disappears without a reload.
    if (url.pathname === '/internal/delete' && request.method === 'POST') {
      const { id } = (await request.json()) as { id: string };
      this.broadcast({ type: 'delete', id });
      return new Response(null, { status: 204 });
    }

    // Internal, worker-only hook: an address's profile or ban status changed —
    // evict the cached identity so the next message re-reads it (keeps nickname
    // and ban changes effectively instant despite the read cache).
    if (url.pathname === '/internal/identity' && request.method === 'POST') {
      const { address } = (await request.json()) as { address: string };
      this.identityCache.delete(address);
      return new Response(null, { status: 204 });
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected websocket', { status: 426 });
    }

    const address = request.headers.get('X-Chat-Address') ?? '';
    // Load the viewer's block list once, at connect. New blocks take effect on
    // the next reconnect (the client forces one after blocking).
    const blocked = address ? await getBlockedBy(this.env.DB, address) : [];

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.state.acceptWebSocket(server);
    server.serializeAttachment({ address, blocked } satisfies SocketAttachment);

    this.schedulePresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(
    ws: WebSocket,
    raw: string | ArrayBuffer
  ): Promise<void> {
    const { address } = (ws.deserializeAttachment() ?? {
      address: '',
      blocked: [],
    }) as SocketAttachment;

    let event: ClientEvent;
    try {
      event = JSON.parse(typeof raw === 'string' ? raw : '') as ClientEvent;
    } catch {
      return this.sendError(ws, 'bad_json');
    }
    // JSON.parse accepts scalars ("null", "42") that would crash on .type.
    if (typeof event !== 'object' || event === null) {
      return this.sendError(ws, 'bad_json');
    }

    switch (event.type) {
      case 'msg':
        return this.handleMessage(ws, address, event.body, event.replyToId);
      case 'react':
        return this.handleReaction(
          ws,
          address,
          event.messageId,
          event.emoji,
          event.op
        );
      default:
        return this.sendError(ws, 'unknown_type');
    }
  }

  webSocketClose(ws: WebSocket): void {
    this.schedulePresence();
  }

  webSocketError(ws: WebSocket): void {
    this.schedulePresence();
  }

  private async handleMessage(
    ws: WebSocket,
    address: string,
    rawBody: string,
    replyToId?: unknown
  ): Promise<void> {
    if (!address) return this.sendError(ws, 'not_authenticated');
    // Guard a non-string body (e.g. {"type":"msg","body":42}) — `?? ''` below
    // only coalesces null/undefined, so a number would reach normalizeBody and
    // throw a TypeError out of webSocketMessage. Any gate-passing poster could
    // otherwise trigger it.
    if (typeof rawBody !== 'string') return this.sendError(ws, 'bad_body');
    // In-memory rate check first: a spammer shouldn't cost a D1 read per attempt.
    if (!this.allowSend(address)) return this.sendError(ws, 'rate_limited');
    // Cached ban + profile in one lookup (TTL'd) — no per-message D1 round-trip.
    const identity = await this.getIdentity(address);
    if (identity.banned) return this.sendError(ws, 'banned');

    const body = normalizeBody(rawBody ?? '');
    if (!body || body.length > MAX_MESSAGE_LENGTH) {
      return this.sendError(ws, 'bad_body');
    }
    // Inline moderation (sync) + AI hook (disabled in v1).
    if (!isClean(body)) return this.sendError(ws, 'blocked_content');
    if (!(await moderateAI(this.env, body))) {
      return this.sendError(ws, 'blocked_content');
    }

    // Resolve an optional reply target. Only a well-formed id that points at a
    // live (non-deleted) message is honored; anything else (garbage id, deleted
    // or pruned parent) is silently dropped and the message posts as a normal
    // one — a vanished target must never block posting. Resolved without a block
    // filter so `reply_to` is stored viewer-independently; per-viewer block
    // filtering is applied later at history read time.
    let replyParentId: string | null = null;
    let replyTo: ChatReplyQuote | undefined;
    // Full address of the quoted parent's author, so the live broadcast can strip
    // the quote for viewers who've blocked them (their history already filters it).
    let replyParentAuthor: string | null = null;
    if (typeof replyToId === 'string' && UUID_RE.test(replyToId)) {
      const quote = await getReplyParent(this.env.DB, replyToId, '');
      if (quote) {
        replyParentId = replyToId;
        replyTo = quote;
        replyParentAuthor = await getMessageSender(this.env.DB, replyToId);
      }
    }

    const id = crypto.randomUUID();
    const ts = Date.now();
    await insertChatMessage(this.env.DB, {
      id,
      address,
      body,
      createdAt: ts,
      replyTo: replyParentId,
    });
    const { nickname, official } = identity;

    // Per-connection block filtering: a blocked sender's messages never reach
    // the blocker. Payload carries only the truncated public sender key.
    this.broadcastMessage(
      {
        type: 'msg',
        id,
        ts,
        address: truncateChatAddress(address),
        nickname,
        official,
        body,
        ...(replyParentId ? { replyToId: replyParentId, replyTo } : {}),
      },
      address,
      replyParentAuthor
    );
  }

  private async handleReaction(
    ws: WebSocket,
    address: string,
    messageId: string,
    emoji: string,
    op: 'add' | 'remove'
  ): Promise<void> {
    if (!address) return this.sendError(ws, 'not_authenticated');
    if (typeof messageId !== 'string' || !messageId) {
      return this.sendError(ws, 'bad_body');
    }
    if (!isReactionEmoji(emoji)) return this.sendError(ws, 'bad_emoji');
    if (op !== 'add' && op !== 'remove') {
      return this.sendError(ws, 'unknown_type');
    }
    if (!this.allowReact(address)) return this.sendError(ws, 'rate_limited');
    if ((await this.getIdentity(address)).banned) {
      return this.sendError(ws, 'banned');
    }

    const changed =
      op === 'add'
        ? await addReaction(this.env.DB, messageId, address, emoji)
        : await removeReaction(this.env.DB, messageId, address, emoji);
    // No-op (already reacted / wasn't reacted): nothing to broadcast.
    if (!changed) return;

    // Same-address multi-device sync: the acting socket updates its own chip
    // optimistically, but the actor's *other* devices only ever see the
    // count-only coalesced flush and would keep a stale `mine`. Send them a
    // targeted echo carrying actor+op so their `mine` stays correct. Only pays
    // a COUNT query when a sibling socket actually exists, so the common
    // single-device path keeps the coalescing optimization untouched.
    const siblings = this.state.getWebSockets().filter((w) => {
      if (w === ws) return false; // acting device already handled optimistically
      const a = w.deserializeAttachment() as SocketAttachment | null;
      return a?.address === address;
    });
    if (siblings.length) {
      const count = await getReactionCount(this.env.DB, messageId, emoji);
      const payload = JSON.stringify({
        type: 'react',
        messageId,
        emoji,
        count,
        actor: truncateChatAddress(address),
        op,
      } satisfies ServerEvent);
      for (const w of siblings) {
        try {
          w.send(payload);
        } catch {
          // Socket already closing; ignore.
        }
      }
    }

    // Coalesce the count broadcast: a pile-on on one message collapses to a
    // single COUNT query + fan-out per REACTION_FLUSH_MS window. The acting
    // client updates its own chip optimistically, so the server no longer needs
    // to echo actor/op for `mine`.
    this.pendingReactions.set(reactionKey(messageId, emoji), { messageId, emoji });
    this.scheduleReactionFlush();
  }

  private allowSend(address: string): boolean {
    return this.rateAllow(this.sendLog, address, MIN_GAP_MS, MAX_PER_WINDOW);
  }

  private allowReact(address: string): boolean {
    return this.rateAllow(
      this.reactLog,
      address,
      REACT_MIN_GAP_MS,
      REACT_MAX_PER_WINDOW
    );
  }

  /** Sliding-window limiter: enforces both a min gap and a per-minute cap. */
  private rateAllow(
    log: Map<string, number[]>,
    address: string,
    minGapMs: number,
    maxPerWindow: number
  ): boolean {
    const now = Date.now();
    const recent = (log.get(address) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= maxPerWindow) {
      log.set(address, recent);
      return false;
    }
    if (recent.length && now - recent[recent.length - 1] < minGapMs) {
      log.set(address, recent);
      return false;
    }
    recent.push(now);
    log.set(address, recent);
    return true;
  }

  private broadcast(event: ServerEvent): void {
    const payload = JSON.stringify(event);
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(payload);
      } catch {
        // Socket already closing; ignore.
      }
    }
  }

  /**
   * Broadcast a message, skipping viewers who have blocked the sender. When the
   * message quotes a reply parent, viewers who've blocked that parent's author
   * receive a quote-stripped variant (replyToId kept → they see the "unavailable"
   * placeholder) so a blocked user's text can't leak through someone else's reply.
   */
  private broadcastMessage(
    event: ServerEvent,
    senderAddress: string,
    replyParentAuthor?: string | null
  ): void {
    const payload = JSON.stringify(event);
    // Built lazily only if some viewer actually blocked the parent author.
    let strippedPayload: string | null = null;
    for (const ws of this.state.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as SocketAttachment | null;
      const blocked = attachment?.blocked;
      if (blocked?.includes(senderAddress)) continue;
      let out = payload;
      if (
        replyParentAuthor &&
        event.type === 'msg' &&
        blocked?.includes(replyParentAuthor)
      ) {
        if (strippedPayload === null) {
          const { replyTo: _omit, ...rest } = event;
          strippedPayload = JSON.stringify(rest);
        }
        out = strippedPayload;
      }
      try {
        ws.send(out);
      } catch {
        // Socket already closing; ignore.
      }
    }
  }

  /**
   * Cached {profile, ban} for an address (TTL IDENTITY_TTL_MS). Collapses the
   * per-message getProfile + isBanned reads to one round-trip per address per
   * window. Resets safely on hibernation (repopulates on next use).
   */
  private async getIdentity(
    address: string
  ): Promise<{ nickname: string | null; official: boolean; banned: boolean }> {
    const cached = this.identityCache.get(address);
    if (cached && cached.exp > Date.now()) return cached;
    const [profile, banned] = await Promise.all([
      getProfile(this.env.DB, address),
      isBanned(this.env.DB, address),
    ]);
    const entry = {
      nickname: profile.nickname,
      official: profile.official,
      banned,
      exp: Date.now() + IDENTITY_TTL_MS,
    };
    this.identityCache.set(address, entry);
    return entry;
  }

  /** Debounced presence: coalesce connect/close/error churn into one trailing
   *  broadcast, and only when the count actually changed. */
  private schedulePresence(): void {
    if (this.presenceTimer) return;
    this.presenceTimer = setTimeout(() => {
      this.presenceTimer = null;
      const online = this.state.getWebSockets().length;
      if (online === this.lastOnline) return;
      this.lastOnline = online;
      this.broadcast({ type: 'presence', online });
    }, PRESENCE_DEBOUNCE_MS);
  }

  private scheduleReactionFlush(): void {
    if (this.reactionFlushTimer) return;
    this.reactionFlushTimer = setTimeout(() => {
      this.reactionFlushTimer = null;
      void this.flushReactions();
    }, REACTION_FLUSH_MS);
  }

  /**
   * Broadcast the latest count for each pending (message, emoji). Counts are
   * anonymous aggregates, so they go to every socket (no per-actor block
   * filter) — this also fixes the prior count drift where a blocker never
   * received an increment from a blocked reactor.
   */
  private async flushReactions(): Promise<void> {
    const pending = [...this.pendingReactions.values()];
    this.pendingReactions.clear();
    let anyFailed = false;
    for (const entry of pending) {
      const { messageId, emoji } = entry;
      try {
        const count = await getReactionCount(this.env.DB, messageId, emoji);
        this.broadcast({ type: 'react', messageId, emoji, count });
      } catch {
        // A transient D1 failure must not drop this pending count (the map was
        // already cleared) nor bubble as an unhandled rejection (we're called
        // via `void`). Re-queue and retry, unless a newer reaction re-added it.
        const key = reactionKey(messageId, emoji);
        if (!this.pendingReactions.has(key)) {
          this.pendingReactions.set(key, entry);
        }
        anyFailed = true;
      }
    }
    if (anyFailed) this.scheduleReactionFlush();
  }

  private sendError(ws: WebSocket, code: ChatErrorCode): void {
    try {
      ws.send(JSON.stringify({ type: 'error', code } satisfies ServerEvent));
    } catch {
      // ignore
    }
  }
}
