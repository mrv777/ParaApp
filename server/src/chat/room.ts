/**
 * ChatRoom — a single global chat room as a SQLite-backed Durable Object using
 * the WebSocket Hibernation API (an idle room with open sockets isn't billed for
 * duration). One instance, id "global".
 *
 * Reachable only via the worker's /chat/ws route, which validates the session
 * token and appends `?address=` (empty for anonymous read-only viewers). The DO
 * trusts that param because it is never exposed publicly.
 */

import type { Env } from '../types';
import type { ClientEvent, ServerEvent, ChatErrorCode } from './protocol';
import { MAX_MESSAGE_LENGTH, isReactionEmoji } from './protocol';
import {
  insertChatMessage,
  isBanned,
  addReaction,
  removeReaction,
  getReactionCount,
  getNickname,
  getBlockedBy,
} from './db';
import { isClean, moderateAI } from './moderation';

interface SocketAttachment {
  /** Empty string = anonymous read-only viewer (may not post). */
  address: string;
  /** Addresses this viewer has blocked (loaded on connect; refreshed on reconnect). */
  blocked: string[];
}

/**
 * Collapse whitespace so a message can't be a wall of blank lines: strip
 * per-line trailing spaces and reduce any run of newlines to a single one.
 */
function normalizeBody(raw: string): string {
  return raw
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

export class ChatRoom {
  private readonly state: DurableObjectState;
  private readonly env: Env;
  /** In-memory recent-action timestamps per address (best-effort; resets on hibernation). */
  private readonly sendLog = new Map<string, number[]>();
  private readonly reactLog = new Map<string, number[]>();

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

    this.broadcastPresence();
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

    switch (event.type) {
      case 'msg':
        return this.handleMessage(ws, address, event.body);
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
    this.broadcastPresence();
  }

  webSocketError(ws: WebSocket): void {
    this.broadcastPresence();
  }

  private async handleMessage(
    ws: WebSocket,
    address: string,
    rawBody: string
  ): Promise<void> {
    if (!address) return this.sendError(ws, 'not_authenticated');
    if (await isBanned(this.env.DB, address)) return this.sendError(ws, 'banned');
    if (!this.allowSend(address)) return this.sendError(ws, 'rate_limited');

    const body = normalizeBody(rawBody ?? '');
    if (!body || body.length > MAX_MESSAGE_LENGTH) {
      return this.sendError(ws, 'bad_body');
    }
    // Inline moderation (sync) + AI hook (disabled in v1).
    if (!isClean(body)) return this.sendError(ws, 'blocked_content');
    if (!(await moderateAI(this.env, body))) {
      return this.sendError(ws, 'blocked_content');
    }

    const id = crypto.randomUUID();
    const ts = Date.now();
    await insertChatMessage(this.env.DB, { id, address, body, createdAt: ts });
    const nickname = await getNickname(this.env.DB, address);

    // Per-connection block filtering: a blocked sender's messages never reach
    // the blocker.
    this.broadcastMessage(
      { type: 'msg', id, ts, address, nickname, body },
      address
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
    if (await isBanned(this.env.DB, address)) return this.sendError(ws, 'banned');
    if (!this.allowReact(address)) return this.sendError(ws, 'rate_limited');

    const changed =
      op === 'add'
        ? await addReaction(this.env.DB, messageId, address, emoji)
        : await removeReaction(this.env.DB, messageId, address, emoji);
    // No-op (already reacted / wasn't reacted): don't broadcast a stale count.
    if (!changed) return;

    const count = await getReactionCount(this.env.DB, messageId, emoji);
    this.broadcast({ type: 'react', messageId, emoji, count, actor: address, op });
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

  /** Broadcast a message, skipping viewers who have blocked the sender. */
  private broadcastMessage(event: ServerEvent, senderAddress: string): void {
    const payload = JSON.stringify(event);
    for (const ws of this.state.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as SocketAttachment | null;
      if (attachment?.blocked?.includes(senderAddress)) continue;
      try {
        ws.send(payload);
      } catch {
        // Socket already closing; ignore.
      }
    }
  }

  private broadcastPresence(): void {
    this.broadcast({ type: 'presence', online: this.state.getWebSockets().length });
  }

  private sendError(ws: WebSocket, code: ChatErrorCode): void {
    try {
      ws.send(JSON.stringify({ type: 'error', code } satisfies ServerEvent));
    } catch {
      // ignore
    }
  }
}
