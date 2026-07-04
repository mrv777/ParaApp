/**
 * Chat WebSocket lifecycle hook.
 *
 * - Opens only in the foreground (driven by useAppState); closes on background.
 * - Mints a posting token from the pool address (read-only if none / gate fails).
 * - Exponential backoff + jitter reconnect; app-level ping/pong heartbeat to
 *   detect silently-dropped mobile connections.
 * - Backfills recent history over REST on every (re)connect, then live messages
 *   flow over the socket. Dedup in the store merges the overlap.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { isError } from '@/api/client';
import { fetchChatSession, fetchChatHistory } from '@/api/chat';
import { useChatStore, MAX_MESSAGES } from '@/store/chatStore';
import { useSettingsStore, selectBitcoinAddress } from '@/store/settingsStore';
import { useAppState } from './useAppState';
import {
  CHAT_WS_URL,
  truncateChatAddress,
  type ServerEvent,
  type ChatErrorCode,
  type ReactionEmoji,
} from '@/constants/chat';

const MAX_RECONNECT_DELAY = 30_000;
const BASE_RECONNECT_DELAY = 1_000;
const PING_INTERVAL = 25_000;
const PONG_TIMEOUT = 10_000;

/**
 * Close a socket we're intentionally tearing down. Detaching the handlers first
 * makes the close silent, so `onclose` never fires and never schedules a
 * reconnect — a network drop (which we DO want to reconnect) still reaches
 * `onclose` because we don't detach there.
 */
function detachAndClose(ws: WebSocket | null): void {
  if (!ws) return;
  ws.onopen = null;
  ws.onmessage = null;
  ws.onerror = null;
  ws.onclose = null;
  try {
    ws.close();
  } catch {
    // ignore
  }
}

export interface UseChatSocketReturn {
  /**
   * Send a chat message; returns false if not connected or not authenticated.
   * Pass `replyToId` (a parent message id) to post it as a reply — the server
   * validates the target and drops the reference if it's gone.
   */
  sendMessage: (body: string, replyToId?: string) => boolean;
  /** Toggle a fixed-set reaction on a message; returns false if not connected/authed. */
  sendReaction: (
    messageId: string,
    emoji: ReactionEmoji,
    op: 'add' | 'remove'
  ) => boolean;
  /** True when a posting token has been obtained for the current address. */
  canPost: boolean;
  /** Current posting token (for REST actions like nickname); null if none. */
  token: string | null;
  /** The caller's current nickname (null = none / read-only), for prefilling the editor. */
  selfNickname: string | null;
  /** Update the cached nickname immediately after a save (before the next re-mint). */
  setSelfNickname: (nickname: string | null) => void;
  /** True when the caller's handle is admin-assigned (locked — not user-editable). */
  selfOfficial: boolean;
  /** True when an address is set but failed the activity gate (or is banned). */
  gateDenied: boolean;
  /** Last server error code (e.g. rate_limited, blocked_content), if any. */
  lastError: ChatErrorCode | null;
  /** Clear the last error (e.g. after showing a toast). */
  clearError: () => void;
  /** Force a reconnect (e.g. after blocking, so the DO reloads the block list). */
  reconnect: () => void;
  /**
   * Re-mint the posting token for the current address without reconnecting the
   * socket. For REST actions (report/block/eula/nickname) that 401 when the
   * token ages out mid-session — the open WS stays valid, only REST needs the
   * fresh token. Returns the new token, or null if none (no address / gate).
   */
  refreshToken: () => Promise<string | null>;
  /**
   * Reconcile history on demand (e.g. when the Chat tab regains focus). Re-runs
   * the backfill if the socket is live, or reconnects if it has silently dropped
   * — covers messages missed while away, a network hiccup, or a dropped event.
   */
  refresh: () => void;
  /** Fetch an older page of history (call on scroll-to-top); no-op if none/in-flight/at cap. */
  loadOlder: () => void;
  /** True while an older page is being fetched (for a top spinner). */
  loadingOlder: boolean;
  /** False once the beginning of history is reached (or the buffer cap is hit). */
  hasMoreHistory: boolean;
}

export function useChatSocket(): UseChatSocketReturn {
  const address = useSettingsStore(selectBitcoinAddress);
  const { isActive } = useAppState();

  const addMessages = useChatStore((s) => s.addMessages);
  const applyReaction = useChatStore((s) => s.applyReaction);
  const removeMessage = useChatStore((s) => s.removeMessage);
  const setOnline = useChatStore((s) => s.setOnline);
  const setConnectionState = useChatStore((s) => s.setConnectionState);
  const setAnnouncement = useChatStore((s) => s.setAnnouncement);
  const setHistoryLoaded = useChatStore((s) => s.setHistoryLoaded);
  const resetMessages = useChatStore((s) => s.reset);
  const clearFeed = useChatStore((s) => s.clearFeed);

  const [canPost, setCanPost] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [selfNickname, setSelfNickname] = useState<string | null>(null);
  const [selfOfficial, setSelfOfficial] = useState(false);
  const [gateDenied, setGateDenied] = useState(false);
  const [lastError, setLastError] = useState<ChatErrorCode | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  // Synchronous guards read inside loadOlder to avoid stale-closure races.
  const loadingOlderRef = useRef(false);
  const hasMoreRef = useRef(true);

  const wsRef = useRef<WebSocket | null>(null);
  const tokenRef = useRef<string | null>(null);
  const attemptsRef = useRef(0);
  const shouldConnectRef = useRef(false);
  // Last address we (re)connected under. When it changes, the server-side history
  // filter (block list) changes with it, so the current feed — merged by id and
  // never pruned by addMessages — must be dropped before backfilling afresh.
  const prevAddressRef = useRef(address);
  // Bumped on every connect(); an in-flight connect bails if superseded, so a
  // reconnect during the async token fetch can't orphan a second live socket.
  const generationRef = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pongTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    if (pingTimer.current) clearInterval(pingTimer.current);
    if (pongTimer.current) clearTimeout(pongTimer.current);
    reconnectTimer.current = null;
    pingTimer.current = null;
    pongTimer.current = null;
  }, []);

  const startHeartbeat = useCallback(() => {
    if (pingTimer.current) clearInterval(pingTimer.current);
    pingTimer.current = setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.send('ping');
      } catch {
        return;
      }
      if (pongTimer.current) clearTimeout(pongTimer.current);
      // No traffic (pong or any message) within the window → treat as dead.
      pongTimer.current = setTimeout(() => {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }, PONG_TIMEOUT);
    }, PING_INTERVAL);
  }, []);

  // Declared as a ref so onclose can call the latest connect without a dep cycle.
  const connectRef = useRef<() => void>(() => {});

  const scheduleReconnect = useCallback(() => {
    if (!shouldConnectRef.current) return;
    const attempt = attemptsRef.current++;
    const delay =
      Math.min(BASE_RECONNECT_DELAY * 2 ** attempt, MAX_RECONNECT_DELAY) +
      Math.random() * 1000; // jitter
    reconnectTimer.current = setTimeout(() => connectRef.current(), delay);
  }, []);

  const backfillHistory = useCallback(async () => {
    try {
      const result = await fetchChatHistory({
        limit: 50,
        token: tokenRef.current ?? undefined,
      });
      if (!isError(result) && result.data.data) {
        if (result.data.data.messages) {
          const fetched = result.data.data.messages;
          // Gap guard: if more than a page arrived while away, the newest-50
          // backfill doesn't overlap the buffer — merging would render a
          // seamless-looking hole that loadOlder (which pages back from the
          // buffer's oldest message) can never fill. No overlap → start fresh.
          const stored = useChatStore.getState().messages;
          if (stored.length > 0 && fetched.length > 0) {
            const oldestFetched = fetched.reduce(
              (min, m) => Math.min(min, m.ts),
              Infinity
            );
            const newestStored = stored[stored.length - 1].ts;
            // Scoped clear only — the socket is live (this runs from onopen's
            // backfill), so a full reset() would wrongly mark it disconnected,
            // zero the unread baseline, and drop delete tombstones.
            if (oldestFetched > newestStored) clearFeed();
          }
          addMessages(fetched);
          // A full page implies older messages may exist; a short page = we've
          // already got the beginning. Reset paging state for the fresh session.
          const more = result.data.data.messages.length >= 50;
          hasMoreRef.current = more;
          setHasMoreHistory(more);
        }
        if (result.data.data.announcement !== undefined) {
          setAnnouncement(result.data.data.announcement);
        }
      }
    } finally {
      // Resolved (success or failure) — swap the feed's initial skeleton for the
      // real content/empty state. A failed fetch must not leave a stuck skeleton.
      setHistoryLoaded(true);
    }
  }, [addMessages, clearFeed, setAnnouncement, setHistoryLoaded]);

  /**
   * Page one screen further back on scroll-to-top. Guarded against concurrent
   * fetches, a known end-of-history, and the buffer cap (= max scroll-back
   * depth, since addMessages trims to the newest MAX_MESSAGES).
   */
  const loadOlder = useCallback(async () => {
    if (loadingOlderRef.current || !hasMoreRef.current) return;
    const state = useChatStore.getState();
    const oldest = state.messages[0]; // oldest-first buffer
    if (!oldest) return; // nothing loaded yet
    if (state.messages.length >= MAX_MESSAGES) return; // buffer full = max depth
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const result = await fetchChatHistory({
        before: oldest.ts,
        beforeId: oldest.id, // tie-break same-ms messages at the boundary
        limit: 50,
        token: tokenRef.current ?? undefined,
      });
      if (!isError(result) && result.data.data?.messages) {
        const older = result.data.data.messages;
        addMessages(older);
        if (older.length < 50) {
          hasMoreRef.current = false; // reached the beginning
          setHasMoreHistory(false);
        }
      }
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [addMessages]);

  /**
   * Fetch a fresh posting token for the current address (read-only → null).
   * Updates `gateDenied` as a side effect but does NOT touch socket/token state —
   * callers decide when to apply the result (connect after its generation guard;
   * refreshToken immediately). Shared by connect() and refreshToken().
   */
  const mintToken = useCallback(async (): Promise<string | null> => {
    if (!address) {
      setGateDenied(false);
      return null;
    }
    const session = await fetchChatSession(address);
    if (!isError(session) && session.data.data?.token) {
      setGateDenied(false);
      // Capture the caller's current handle so the editor can prefill + lock it.
      setSelfNickname(session.data.data.nickname ?? null);
      setSelfOfficial(!!session.data.data.official);
      return session.data.data.token;
    }
    // Address has no pool activity or is banned — distinct from "verifying".
    if (isError(session) && session.error.status === 403) setGateDenied(true);
    return null;
  }, [address]);

  const connect = useCallback(async () => {
    if (!shouldConnectRef.current) return;
    const gen = ++generationRef.current; // supersede any in-flight connect
    // Cancel any pending backoff reconnect — otherwise a timer scheduled by an
    // earlier failed attempt could later fire and tear down the socket we're
    // about to (or just did) establish.
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    // Tear down any existing socket first (silent — no reconnect).
    detachAndClose(wsRef.current);
    wsRef.current = null;

    setConnectionState('connecting');

    // Acquire a posting token if we have an address (read-only otherwise).
    const token = await mintToken();
    // Bail if backgrounded or superseded by a newer connect during the await.
    if (!shouldConnectRef.current || gen !== generationRef.current) return;
    tokenRef.current = token;
    setToken(token);
    setCanPost(!!token);

    const url = token
      ? `${CHAT_WS_URL}?token=${encodeURIComponent(token)}`
      : CHAT_WS_URL;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      attemptsRef.current = 0;
      setConnectionState('connected');
      startHeartbeat();
      void backfillHistory();
    };

    ws.onmessage = (event) => {
      const data = event.data;
      // Heartbeat auto-response (or any traffic) clears the liveness timer.
      if (pongTimer.current) {
        clearTimeout(pongTimer.current);
        pongTimer.current = null;
      }
      if (typeof data !== 'string' || data === 'pong') return;

      let msg: ServerEvent;
      try {
        msg = JSON.parse(data) as ServerEvent;
      } catch {
        return;
      }
      switch (msg.type) {
        case 'msg':
          addMessages([
            {
              id: msg.id,
              ts: msg.ts,
              address: msg.address,
              nickname: msg.nickname,
              official: msg.official,
              body: msg.body,
              ...(msg.replyToId ? { replyToId: msg.replyToId } : {}),
              ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
            },
          ]);
          break;
        case 'history':
          addMessages(msg.messages);
          break;
        case 'presence':
          setOnline(msg.online);
          break;
        case 'announcement':
          setAnnouncement(msg.body);
          break;
        case 'delete':
          removeMessage(msg.id);
          break;
        case 'error':
          setLastError(msg.code);
          break;
        case 'react': {
          // `mine` flips only when this device is the actor; others' reactions
          // leave our flag untouched (undefined). Actors arrive as truncated
          // public keys, so compare against our own truncated form.
          const mine =
            address && msg.actor === truncateChatAddress(address)
              ? msg.op === 'add'
              : undefined;
          applyReaction(msg.messageId, msg.emoji, msg.count, mine);
          break;
        }
      }
    };

    ws.onclose = () => {
      if (wsRef.current === ws) wsRef.current = null;
      setConnectionState('disconnected');
      if (pingTimer.current) clearInterval(pingTimer.current);
      if (pongTimer.current) {
        clearTimeout(pongTimer.current);
        pongTimer.current = null;
      }
      scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose fires next and handles reconnect.
      try {
        ws.close();
      } catch {
        // ignore
      }
    };
  }, [
    address,
    mintToken,
    addMessages,
    applyReaction,
    removeMessage,
    setOnline,
    setConnectionState,
    setAnnouncement,
    startHeartbeat,
    backfillHistory,
    scheduleReconnect,
  ]);

  // Keep the ref pointing at the latest connect. Declared before the
  // lifecycle effect below so it has run by the time that effect connects.
  useEffect(() => {
    connectRef.current = () => void connect();
  }, [connect]);

  // Foreground → connect; background → disconnect. Re-run when the address
  // changes so posting picks up the new identity's token.
  useEffect(() => {
    if (isActive) {
      // Identity switch (address changed) → drop the feed loaded under the old
      // block filter so backfill can't leave now-blocked senders visible. Guarded
      // to address-value changes only, so ordinary reconnects don't flash empty.
      if (prevAddressRef.current !== address) resetMessages();
      prevAddressRef.current = address;
      shouldConnectRef.current = true;
      attemptsRef.current = 0;
      void connect();
    } else {
      shouldConnectRef.current = false;
      clearTimers();
      detachAndClose(wsRef.current);
      wsRef.current = null;
      setConnectionState('disconnected');
    }

    return () => {
      shouldConnectRef.current = false;
      clearTimers();
      detachAndClose(wsRef.current);
      wsRef.current = null;
    };
  }, [isActive, address, connect, clearTimers, setConnectionState, resetMessages]);

  const sendMessage = useCallback(
    (body: string, replyToId?: string): boolean => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || !tokenRef.current) {
        return false;
      }
      const trimmed = body.trim();
      if (!trimmed) return false;
      try {
        ws.send(
          JSON.stringify({
            type: 'msg',
            body: trimmed,
            ...(replyToId ? { replyToId } : {}),
          })
        );
        return true;
      } catch {
        return false;
      }
    },
    []
  );

  const sendReaction = useCallback(
    (messageId: string, emoji: ReactionEmoji, op: 'add' | 'remove'): boolean => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || !tokenRef.current) {
        return false;
      }
      try {
        ws.send(JSON.stringify({ type: 'react', messageId, emoji, op }));
        return true;
      } catch {
        return false;
      }
    },
    []
  );

  const clearError = useCallback(() => setLastError(null), []);

  const reconnect = useCallback(() => {
    if (shouldConnectRef.current) connectRef.current();
  }, []);

  const refreshToken = useCallback(async (): Promise<string | null> => {
    const fresh = await mintToken();
    // Apply on success so canPost + future REST calls use the new token; leave
    // the existing token in place on failure (the caller's retry just fails).
    if (fresh) {
      tokenRef.current = fresh;
      setToken(fresh);
      setCanPost(true);
    }
    return fresh;
  }, [mintToken]);

  const refresh = useCallback(() => {
    if (!shouldConnectRef.current) return;
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      // A transient session-mint failure leaves a healthy read-only socket
      // with no token and gateDenied false — the composer shows "verifying"
      // forever because nothing re-mints. Reconnect to retry the mint (posting
      // rights are granted at WS upgrade, so a token alone wouldn't help).
      if (address && !tokenRef.current && !gateDenied) {
        connectRef.current();
        return;
      }
      void backfillHistory(); // live socket → just reconcile recent history
    } else {
      connectRef.current(); // dead/connecting → (re)establish; backfills on open
    }
  }, [backfillHistory, address, gateDenied]);

  return {
    sendMessage,
    sendReaction,
    canPost,
    token,
    selfNickname,
    setSelfNickname,
    selfOfficial,
    gateDenied,
    lastError,
    clearError,
    reconnect,
    refreshToken,
    refresh,
    loadOlder: () => void loadOlder(),
    loadingOlder,
    hasMoreHistory,
  };
}
