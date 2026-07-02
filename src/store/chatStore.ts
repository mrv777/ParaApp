/**
 * Chat store: live message list + connection/presence state.
 *
 * Not persisted — history is backfilled from the server on (re)connect, so there
 * is nothing to keep locally. Follows the stable-selector rules in
 * .claude/CLAUDE.md (const EMPTY array, module-level selectors).
 */

import { create } from 'zustand';
import type { ChatMessage } from '@/constants/chat';

export type ChatConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected';

const EMPTY_MESSAGES: ChatMessage[] = [];

interface ChatState {
  messages: ChatMessage[]; // newest-first (index 0 = newest), matches inverted FlatList
  online: number;
  connectionState: ChatConnectionState;
}

interface ChatActions {
  /** Merge messages (live, history, or older page) by id, keeping newest-first. */
  addMessages: (incoming: ChatMessage[]) => void;
  setOnline: (online: number) => void;
  setConnectionState: (state: ChatConnectionState) => void;
  reset: () => void;
}

const initialState: ChatState = {
  messages: EMPTY_MESSAGES,
  online: 0,
  connectionState: 'disconnected',
};

export const useChatStore = create<ChatState & ChatActions>()((set) => ({
  ...initialState,

  addMessages: (incoming) =>
    set((state) => {
      if (incoming.length === 0) return state;
      const byId = new Map(state.messages.map((m) => [m.id, m]));
      for (const message of incoming) byId.set(message.id, message);
      const merged = Array.from(byId.values()).sort((a, b) => b.ts - a.ts);
      return { messages: merged };
    }),

  setOnline: (online) => set({ online }),

  setConnectionState: (connectionState) => set({ connectionState }),

  reset: () => set({ ...initialState }),
}));

// Selectors
export const selectChatMessages = (state: ChatState) => state.messages;
export const selectChatOnline = (state: ChatState) => state.online;
export const selectChatConnectionState = (state: ChatState) =>
  state.connectionState;
/** Oldest ts loaded — exclusive cursor for paging further back. */
export const selectOldestTs = (state: ChatState): number | undefined =>
  state.messages.length
    ? state.messages[state.messages.length - 1].ts
    : undefined;
