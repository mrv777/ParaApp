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

export interface ReactionSummary {
  emoji: ReactionEmoji;
  count: number;
  /** True when the current user is one of the reactors. */
  mine?: boolean;
}

export interface ChatMessage {
  id: string;
  ts: number; // ms epoch
  address: string;
  nickname: string | null;
  body: string;
  reactions?: ReactionSummary[];
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
