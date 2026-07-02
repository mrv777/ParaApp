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

export interface ReactionSummary {
  emoji: ReactionEmoji;
  count: number;
  /** True when the current user is one of the reactors. */
  mine?: boolean;
}

/**
 * Quoted parent shown above a reply's body. The design specifies reply-quotes,
 * but the server protocol does not carry a parent reference yet, so this stays
 * unpopulated for now — the UI render path is ready for when the backend adds
 * `replyTo` to the `msg` event + a D1 column. See the Chat screen handoff notes.
 */
export interface ChatReplyQuote {
  /** Display string of the replied-to sender (nickname or truncated address). */
  senderDisplay: string;
  /** One-line preview of the replied-to message body. */
  textPreview: string;
}

export interface ChatMessage {
  id: string;
  ts: number; // ms epoch
  address: string;
  nickname: string | null;
  /** True when the nickname is an admin-assigned (locked) official handle. */
  official?: boolean;
  body: string;
  reactions?: ReactionSummary[];
  /** Present only when this message is a reply (not yet wired server-side). */
  replyTo?: ChatReplyQuote;
}

export type ClientEvent =
  | { type: 'msg'; body: string }
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
    }
  | {
      type: 'react';
      messageId: string;
      emoji: ReactionEmoji;
      count: number;
      actor: string;
      op: 'add' | 'remove';
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
  | 'not_supported';

export function isReactionEmoji(value: string): value is ReactionEmoji {
  return (REACTION_EMOJIS as readonly string[]).includes(value);
}
