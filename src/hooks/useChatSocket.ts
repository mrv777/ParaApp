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
import { useChatStore } from '@/store/chatStore';
import { useSettingsStore, selectBitcoinAddress } from '@/store/settingsStore';
import { useAppState } from './useAppState';
import {
  CHAT_WS_URL,
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
  /** Send a chat message; returns false if not connected or not authenticated. */
  sendMessage: (body: string) => boolean;
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
  /** True when an address is set but failed the activity gate (or is banned). */
  gateDenied: boolean;
  /** Last server error code (e.g. rate_limited, blocked_content), if any. */
  lastError: ChatErrorCode | null;
  /** Clear the last error (e.g. after showing a toast). */
  clearError: () => void;
  /** Force a reconnect (e.g. after blocking, so the DO reloads the block list). */
  reconnect: () => void;
}

export function useChatSocket(): UseChatSocketReturn {
  const address = useSettingsStore(selectBitcoinAddress);
  const { isActive } = useAppState();

  const addMessages = useChatStore((s) => s.addMessages);
  const applyReaction = useChatStore((s) => s.applyReaction);
  const setOnline = useChatStore((s) => s.setOnline);
  const setConnectionState = useChatStore((s) => s.setConnectionState);

  const [canPost, setCanPost] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [gateDenied, setGateDenied] = useState(false);
  const [lastError, setLastError] = useState<ChatErrorCode | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const tokenRef = useRef<string | null>(null);
  const attemptsRef = useRef(0);
  const shouldConnectRef = useRef(false);
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
    const result = await fetchChatHistory({
      limit: 50,
      address: address ?? undefined,
    });
    if (!isError(result) && result.data.data?.messages) {
      addMessages(result.data.data.messages);
    }
  }, [addMessages, address]);

  const connect = useCallback(async () => {
    if (!shouldConnectRef.current) return;
    // Tear down any existing socket first (silent — no reconnect).
    detachAndClose(wsRef.current);
    wsRef.current = null;

    setConnectionState('connecting');

    // Acquire a posting token if we have an address (read-only otherwise).
    let token: string | null = null;
    if (address) {
      const session = await fetchChatSession(address);
      if (!isError(session) && session.data.data?.token) {
        token = session.data.data.token;
        setGateDenied(false);
      } else if (isError(session) && session.error.status === 403) {
        // Address has no pool activity or is banned — distinct from "verifying".
        setGateDenied(true);
      }
    } else {
      setGateDenied(false);
    }
    if (!shouldConnectRef.current) return; // backgrounded during the await
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
              body: msg.body,
            },
          ]);
          break;
        case 'history':
          addMessages(msg.messages);
          break;
        case 'presence':
          setOnline(msg.online);
          break;
        case 'error':
          setLastError(msg.code);
          break;
        case 'react': {
          // `mine` flips only when this device is the actor; others' reactions
          // leave our flag untouched (undefined).
          const mine = msg.actor === address ? msg.op === 'add' : undefined;
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
    addMessages,
    applyReaction,
    setOnline,
    setConnectionState,
    startHeartbeat,
    backfillHistory,
    scheduleReconnect,
  ]);

  connectRef.current = () => void connect();

  // Foreground → connect; background → disconnect. Re-run when the address
  // changes so posting picks up the new identity's token.
  useEffect(() => {
    if (isActive) {
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
  }, [isActive, connect, clearTimers, setConnectionState]);

  const sendMessage = useCallback((body: string): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !tokenRef.current) {
      return false;
    }
    const trimmed = body.trim();
    if (!trimmed) return false;
    try {
      ws.send(JSON.stringify({ type: 'msg', body: trimmed }));
      return true;
    } catch {
      return false;
    }
  }, []);

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

  return {
    sendMessage,
    sendReaction,
    canPost,
    token,
    gateDenied,
    lastError,
    clearError,
    reconnect,
  };
}
