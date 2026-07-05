/**
 * Chat store: live message list + connection/presence state.
 *
 * Messages are not persisted — history is backfilled from the server on
 * (re)connect, so there is nothing to keep locally. Only `lastSeenTs` persists
 * (see partialize), so the tab-bar unread dot survives relaunches. Follows the
 * stable-selector rules in .claude/CLAUDE.md (const EMPTY array, module-level
 * selectors).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ChatMessage, ReactionEmoji } from '@/constants/chat';

export type ChatConnectionState = 'connecting' | 'connected' | 'disconnected';

const EMPTY_MESSAGES: ChatMessage[] = [];
/**
 * Cap the in-memory list so a long-lived foreground session stays bounded. Also
 * doubles as the max scroll-back depth: paging older stops once the buffer is
 * full (see useChatSocket.loadOlder), since keep-newest-N trimming would
 * otherwise drop the very messages just fetched.
 */
export const MAX_MESSAGES = 1000;

interface ChatState {
  messages: ChatMessage[]; // oldest-first (index 0 = oldest), matches LegendList alignItemsAtEnd
  online: number;
  connectionState: ChatConnectionState;
  /**
   * True once the first history backfill of this session has resolved (success
   * or failure). Gates the feed's initial skeleton vs. the real empty state, so
   * a still-loading room isn't shown as "no messages yet". Re-armed on reset().
   */
  historyLoaded: boolean;
  announcement: string | null; // admin banner shown at the top (null = none)
  /**
   * Newest message ts the user has actually looked at (Chat tab focused).
   * Drives the tab-bar unread dot. Persisted (the only persisted field), so
   * the dot correctly reflects messages that arrived while the app was closed.
   */
  lastSeenTs: number;
  /**
   * Newest server message ts seen by the app-level unread probe
   * (useChatUnreadCheck), which runs even when the Chat screen has never
   * mounted. Lets the unread dot light with zero loaded messages. Session-only
   * — persisting it could pin the dot to a since-deleted message forever.
   */
  latestKnownTs: number;
  /**
   * Set when the block list changed off the Chat screen (e.g. unblock from
   * Settings), where there's no live socket to reconnect. The Chat screen forces
   * one reconnect on its next focus so the Durable Object reloads the block list
   * (it's only read at connect); the block-from-chat path reconnects inline, so
   * it never needs this. Session-only; cleared on reset().
   */
  blockListStale: boolean;
}

interface ChatActions {
  /** Merge messages (live, history, or older page) by id, keeping newest-first. */
  addMessages: (incoming: ChatMessage[]) => void;
  /**
   * Apply a live reaction update to a message. `count` is the authoritative new
   * count for that emoji (0 removes the chip). `mine` is set only when this
   * device is the actor (undefined leaves the existing flag untouched).
   */
  applyReaction: (messageId: string, emoji: ReactionEmoji, count: number, mine?: boolean) => void;
  /** Optimistically drop a blocked address's messages (server enforces on reconnect). */
  removeMessagesFrom: (address: string) => void;
  /** Drop a single message by id (admin moderation delete, pushed over the socket). */
  removeMessage: (id: string) => void;
  setOnline: (online: number) => void;
  setConnectionState: (state: ChatConnectionState) => void;
  /** Mark the initial history backfill as resolved (or re-arm with false). */
  setHistoryLoaded: (loaded: boolean) => void;
  setAnnouncement: (announcement: string | null) => void;
  /** Flag/clear a block-list change made off the Chat screen (drives a focus reconnect). */
  setBlockListStale: (stale: boolean) => void;
  /** Record the newest server ts found by the unread probe (forward-only). */
  setLatestKnownTs: (ts: number) => void;
  /** Mark everything currently loaded as seen (call while the Chat tab is focused). */
  markSeen: () => void;
  /**
   * Drop the loaded feed (messages + history-loaded flag) WITHOUT touching
   * connection/presence/lastSeen/tombstone state. For rebuilding the feed on a
   * live socket (e.g. a backfill gap) where a full reset() would wrongly flip
   * the UI to disconnected, clear the unread baseline, and resurrect deletes.
   */
  clearFeed: () => void;
  reset: () => void;
}

/**
 * Ids removed via live `delete` events. A history fetch already in flight when
 * the delete arrived would otherwise re-merge the message and resurrect it.
 * Session-only, bounded by MAX_MESSAGES-scale traffic; cleared on reset().
 */
const deletedIds = new Set<string>();
const MAX_DELETED_IDS = 500;

const initialState: ChatState = {
  messages: EMPTY_MESSAGES,
  online: 0,
  connectionState: 'disconnected',
  historyLoaded: false,
  announcement: null,
  lastSeenTs: 0,
  latestKnownTs: 0,
  blockListStale: false,
};

export const useChatStore = create<ChatState & ChatActions>()(
  persist(
    (set) => ({
      ...initialState,

      addMessages: (incoming) =>
        set((state) => {
          if (incoming.length === 0) return state;
          const byId = new Map(state.messages.map((m) => [m.id, m]));
          for (const message of incoming) {
            if (deletedIds.has(message.id)) continue; // deleted mid-fetch
            const existing = byId.get(message.id);
            // A copy without reaction data (live redelivery, or a backfill racing
            // a just-applied react event) must not wipe reactions we already have.
            if (existing?.reactions && message.reactions === undefined) {
              byId.set(message.id, { ...message, reactions: existing.reactions });
            } else {
              byId.set(message.id, message);
            }
          }
          const merged = Array.from(byId.values())
            .sort((a, b) => a.ts - b.ts)
            .slice(-MAX_MESSAGES); // oldest-first, keep the most recent N
          return { messages: merged };
        }),

      applyReaction: (messageId, emoji, count, mine) =>
        set((state) => {
          const idx = state.messages.findIndex((m) => m.id === messageId);
          if (idx === -1) return state; // message not loaded (yet)
          const message = state.messages[idx];
          const reactions = (message.reactions ?? []).filter((r) => r.emoji !== emoji);
          if (count > 0) {
            const previous = message.reactions?.find((r) => r.emoji === emoji);
            reactions.push({
              emoji,
              count,
              mine: mine ?? previous?.mine ?? false,
            });
          }
          // Keep a stable emoji order for steady chip layout.
          reactions.sort((a, b) => a.emoji.localeCompare(b.emoji));
          const nextMessages = state.messages.slice();
          nextMessages[idx] = {
            ...message,
            reactions: reactions.length ? reactions : undefined,
          };
          return { messages: nextMessages };
        }),

      removeMessagesFrom: (address) =>
        set((state) => {
          // Ids of the blocked user's own (loaded) messages, so replies that quote
          // them lose the quote too — not just the messages themselves.
          const removedIds = new Set(
            state.messages.filter((m) => m.address === address).map((m) => m.id)
          );
          if (removedIds.size === 0) return state;
          const next = [];
          for (const m of state.messages) {
            if (m.address === address) continue; // drop the blocked user's messages
            if (
              m.replyToId &&
              m.replyTo &&
              (removedIds.has(m.replyToId) || m.replyTo.senderKey === address)
            ) {
              // Quoted a now-blocked sender → strip the quote; keep replyToId so the
              // row shows the "unavailable" placeholder rather than the blocked text.
              // Match by loaded parent id OR the quote's own sender key, so a reply
              // to an unloaded/older parent from the blocked user is scrubbed too.
              const stripped = { ...m };
              delete stripped.replyTo;
              next.push(stripped);
            } else {
              next.push(m);
            }
          }
          return { messages: next };
        }),

      removeMessage: (id) =>
        set((state) => {
          if (deletedIds.size >= MAX_DELETED_IDS) deletedIds.clear();
          deletedIds.add(id); // block re-merge by an in-flight history fetch
          let changed = false;
          const next = [];
          for (const m of state.messages) {
            if (m.id === id) {
              changed = true; // drop the deleted message itself
              continue;
            }
            if (m.replyToId === id && m.replyTo) {
              // Parent was just deleted (admin moderation) — drop the stale quote and
              // keep replyToId so the reply immediately shows the "unavailable"
              // placeholder instead of the removed text, without waiting for reconcile.
              const stripped = { ...m };
              delete stripped.replyTo;
              next.push(stripped);
              changed = true;
            } else {
              next.push(m);
            }
          }
          return changed ? { messages: next } : state;
        }),

      setOnline: (online) => set({ online }),

      setConnectionState: (connectionState) => set({ connectionState }),

      setHistoryLoaded: (historyLoaded) => set({ historyLoaded }),

      setAnnouncement: (announcement) => set({ announcement }),

      setBlockListStale: (blockListStale) => set({ blockListStale }),

      setLatestKnownTs: (ts) =>
        set((state) => (ts > state.latestKnownTs ? { latestKnownTs: ts } : state)),

      markSeen: () =>
        set((state) => {
          const loaded = state.messages.length ? state.messages[state.messages.length - 1].ts : 0;
          // Include latestKnownTs: markSeen only fires while Chat is focused, and
          // focus triggers an immediate newest-50 backfill, so anything the probe
          // saw is on screen moments later — without this the dot could stick when
          // the probe raced the backfill or the newest message was since deleted.
          const newest = Math.max(loaded, state.latestKnownTs);
          return newest > state.lastSeenTs ? { lastSeenTs: newest } : state;
        }),

      clearFeed: () => set({ messages: EMPTY_MESSAGES, historyLoaded: false }),

      reset: () => {
        deletedIds.clear();
        set({ ...initialState });
      },
    }),
    {
      name: 'parasite-chat',
      storage: createJSONStorage(() => AsyncStorage),
      // Only the unread baseline persists; messages/presence rebuild live.
      partialize: (state) => ({ lastSeenTs: state.lastSeenTs }),
    }
  )
);

/**
 * Resolves once the persisted chat state has rehydrated from AsyncStorage.
 * The app-level unread probe awaits this so it compares against the real
 * persisted lastSeenTs instead of the initial 0 (which would flash the dot).
 */
export function awaitChatHydration(timeoutMs = 5000): Promise<void> {
  if (useChatStore.persist.hasHydrated()) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      unsub();
      clearTimeout(timer);
      resolve();
    };
    // Safety net: never hang on a stuck storage read.
    const timer = setTimeout(finish, timeoutMs);
    const unsub = useChatStore.persist.onFinishHydration(finish);
  });
}

// Selectors
export const selectChatMessages = (state: ChatState) => state.messages;
export const selectChatOnline = (state: ChatState) => state.online;
export const selectChatConnectionState = (state: ChatState) => state.connectionState;
/** True once the first history backfill of the session has resolved. */
export const selectChatHistoryLoaded = (state: ChatState) => state.historyLoaded;
export const selectChatAnnouncement = (state: ChatState) => state.announcement;
/** True when an off-screen block-list change needs a Chat-focus reconnect. */
export const selectBlockListStale = (state: ChatState) => state.blockListStale;
/** True when messages newer than the last focused view exist (tab-bar dot). */
export const selectHasUnread = (state: ChatState): boolean => {
  const loaded = state.messages.length ? state.messages[state.messages.length - 1].ts : 0;
  // latestKnownTs lets the dot light before the Chat screen has ever mounted
  // (no loaded messages yet) — fed by the app-level unread probe.
  return Math.max(loaded, state.latestKnownTs) > state.lastSeenTs;
};
