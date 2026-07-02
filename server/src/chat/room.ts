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
} from './db';

interface SocketAttachment {
  /** Empty string = anonymous read-only viewer (may not post). */
  address: string;
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
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected websocket', { status: 426 });
    }

    const address = request.headers.get('X-Chat-Address') ?? '';
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.state.acceptWebSocket(server);
    server.serializeAttachment({ address } satisfies SocketAttachment);

    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(
    ws: WebSocket,
    raw: string | ArrayBuffer
  ): Promise<void> {
    const { address } = (ws.deserializeAttachment() ?? {
      address: '',
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

    const body = (rawBody ?? '').trim();
    if (!body || body.length > MAX_MESSAGE_LENGTH) {
      return this.sendError(ws, 'bad_body');
    }
    // Inline + AI moderation hook lands in Phase 5.

    const id = crypto.randomUUID();
    const ts = Date.now();
    await insertChatMessage(this.env.DB, { id, address, body, createdAt: ts });

    this.broadcast({
      type: 'msg',
      id,
      ts,
      address,
      nickname: null, // populated once profiles land (Phase 4)
      body,
    });
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
