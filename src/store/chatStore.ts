/**
 * Chat store: live message list + connection/presence state.
 *
 * Not persisted — history is backfilled from the server on (re)connect, so there
 * is nothing to keep locally. Follows the stable-selector rules in
 * .claude/CLAUDE.md (const EMPTY array, module-level selectors).
 */

import { create } from 'zustand';
import type { ChatMessage, ReactionEmoji } from '@/constants/chat';

export type ChatConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected';

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
  announcement: string | null; // admin banner shown at the top (null = none)
}

interface ChatActions {
  /** Merge messages (live, history, or older page) by id, keeping newest-first. */
  addMessages: (incoming: ChatMessage[]) => void;
  /**
   * Apply a live reaction update to a message. `count` is the authoritative new
   * count for that emoji (0 removes the chip). `mine` is set only when this
   * device is the actor (undefined leaves the existing flag untouched).
   */
  applyReaction: (
    messageId: string,
    emoji: ReactionEmoji,
    count: number,
    mine?: boolean
  ) => void;
  /** Optimistically drop a blocked address's messages (server enforces on reconnect). */
  removeMessagesFrom: (address: string) => void;
  /** Drop a single message by id (admin moderation delete, pushed over the socket). */
  removeMessage: (id: string) => void;
  setOnline: (online: number) => void;
  setConnectionState: (state: ChatConnectionState) => void;
  setAnnouncement: (announcement: string | null) => void;
  reset: () => void;
}

const initialState: ChatState = {
  messages: EMPTY_MESSAGES,
  online: 0,
  connectionState: 'disconnected',
  announcement: null,
};

export const useChatStore = create<ChatState & ChatActions>()((set) => ({
  ...initialState,

  addMessages: (incoming) =>
    set((state) => {
      if (incoming.length === 0) return state;
      const byId = new Map(state.messages.map((m) => [m.id, m]));
      for (const message of incoming) byId.set(message.id, message);
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
      const reactions = (message.reactions ?? []).filter(
        (r) => r.emoji !== emoji
      );
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
      const filtered = state.messages.filter((m) => m.address !== address);
      return filtered.length === state.messages.length
        ? state
        : { messages: filtered };
    }),

  removeMessage: (id) =>
    set((state) => {
      const filtered = state.messages.filter((m) => m.id !== id);
      return filtered.length === state.messages.length
        ? state
        : { messages: filtered };
    }),

  setOnline: (online) => set({ online }),

  setConnectionState: (connectionState) => set({ connectionState }),

  setAnnouncement: (announcement) => set({ announcement }),

  reset: () => set({ ...initialState }),
}));

// Selectors
export const selectChatMessages = (state: ChatState) => state.messages;
export const selectChatOnline = (state: ChatState) => state.online;
export const selectChatConnectionState = (state: ChatState) =>
  state.connectionState;
export const selectChatAnnouncement = (state: ChatState) => state.announcement;
/** Oldest ts loaded — exclusive cursor for paging further back. */
export const selectOldestTs = (state: ChatState): number | undefined =>
  state.messages.length ? state.messages[0].ts : undefined;
