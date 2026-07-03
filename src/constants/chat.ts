/**
 * Chat constants + WS protocol types.
 *
 * These mirror `server/src/chat/protocol.ts` (the source of truth). The RN app
 * can't import from the worker package, so keep the two in sync by hand when the
 * protocol changes.
 */

import Constants from 'expo-constants';

/** Same base as push.ts so both hit the one worker. */
const HTTP_BASE: string =
  (Constants.expoConfig?.extra?.pushApiUrl as string | undefined) ??
  'https://paraapp-notifications.7fmqnkfyfq.workers.dev';

export const CHAT_HTTP_BASE = HTTP_BASE;
export const CHAT_WS_URL = `${HTTP_BASE.replace(/^http/, 'ws')}/chat/ws`;

/** Fixed, locked reaction set (matches server). */
export const REACTION_EMOJIS = ['👍', '🔥', '⚡', '🎉'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export const MAX_MESSAGE_LENGTH = 500;
export const MAX_NICKNAME_LENGTH = 24;

/** Bump when the community guidelines / EULA change to re-prompt acceptance. */
export const CHAT_EULA_VERSION = '1';

/**
 * Legal pages hosted on mrv777.com under /paraapp/ (source in the repo's local
 * `legal/paraapp/` folder; upload those files to publish). Live once uploaded.
 */
export const CHAT_LEGAL_URLS = {
  guidelines: 'https://mrv777.com/paraapp/chat-guidelines.html',
  eula: 'https://mrv777.com/paraapp/eula.html',
  privacy: 'https://mrv777.com/paraapp/privacy.html',
} as const;

/**
 * Public form of a sender address in server payloads (mirrors
 * truncateChatAddress in server protocol.ts). The server never sends full
 * addresses — apply this to the user's own address before comparing against
 * `message.address` / react `actor`.
 */
export function truncateChatAddress(address: string): string {
  if (address.length <= 15) return address;
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

export interface ReactionSummary {
  emoji: ReactionEmoji;
  count: number;
  /** True when the current user is one of the reactors. */
  mine?: boolean;
}

/**
 * Quoted parent shown above a reply's body. Hydrated by the server at
 * read/broadcast time from the live parent row, so it is absent (while
 * `replyToId` is still present) when the parent is deleted, pruned, or from a
 * sender the viewer has blocked — the row then renders a generic placeholder.
 */
export interface ChatReplyQuote {
  /** Display string of the replied-to sender (nickname or truncated address). */
  senderDisplay: string;
  /**
   * Truncated public sender key of the quoted parent's author (matches
   * ChatMessage.address). Lets a block strip this quote even when the parent
   * message isn't loaded. Optional so an older server that omits it degrades
   * gracefully to parent-loaded-only stripping.
   */
  senderKey?: string;
  /** One-line preview of the replied-to message body. */
  textPreview: string;
}

export interface ChatMessage {
  id: string;
  ts: number; // ms epoch
  /** Truncated public sender key (see truncateChatAddress) — never the full address. */
  address: string;
  nickname: string | null;
  /** True when the nickname is an admin-assigned (locked) official handle. */
  official?: boolean;
  body: string;
  reactions?: ReactionSummary[];
  /** Parent message id when this is a reply (present even if the quote isn't). */
  replyToId?: string;
  /** Hydrated parent quote; absent when the parent is unavailable to the viewer. */
  replyTo?: ChatReplyQuote;
}

export type ClientEvent =
  | { type: 'msg'; body: string; replyToId?: string }
  | {
      type: 'react';
      messageId: string;
      emoji: ReactionEmoji;
      op: 'add' | 'remove';
    };

export type ServerEvent =
  | {
      type: 'msg';
      id: string;
      ts: number;
      address: string;
      nickname: string | null;
      official?: boolean;
      body: string;
      replyToId?: string;
      replyTo?: ChatReplyQuote;
    }
  | {
      type: 'react';
      messageId: string;
      emoji: ReactionEmoji;
      count: number;
      // Coalesced count broadcasts omit these; `count` is authoritative and the
      // client owns `mine` optimistically (see ChatScreen handleToggleReaction).
      actor?: string;
      op?: 'add' | 'remove';
    }
  | { type: 'presence'; online: number }
  | { type: 'announcement'; body: string | null }
  | { type: 'delete'; id: string }
  | { type: 'history'; messages: ChatMessage[] }
  | { type: 'error'; code: ChatErrorCode };

export type ChatErrorCode =
  | 'bad_json'
  | 'unknown_type'
  | 'not_authenticated'
  | 'banned'
  | 'rate_limited'
  | 'bad_body'
  | 'blocked_content'
  | 'bad_emoji'
  | 'not_supported'
  // An internal server failure blocked the send (see server protocol.ts).
  | 'server_error';

export function isReactionEmoji(value: string): value is ReactionEmoji {
  return (REACTION_EMOJIS as readonly string[]).includes(value);
}
