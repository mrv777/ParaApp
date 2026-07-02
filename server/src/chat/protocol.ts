/**
 * Chat WebSocket protocol — the single source of truth shared by the Durable
 * Object, the REST routes, and the smoke-test harness. The RN client mirrors
 * these shapes in `src/constants/chat.ts`.
 */

/** Fixed, locked reaction set. Not arbitrary emoji. */
export const REACTION_EMOJIS = ['👍', '🔥', '⚡', '🎉'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

/** Max characters in a chat message body (post-trim). */
export const MAX_MESSAGE_LENGTH = 500;
/** Max characters in a nickname. */
export const MAX_NICKNAME_LENGTH = 24;

export interface ReactionSummary {
  emoji: ReactionEmoji;
  count: number;
}

/** A message as returned by history/broadcast (reactions present once Phase 3 lands). */
export interface ChatMessage {
  id: string;
  ts: number; // ms epoch
  address: string;
  nickname: string | null;
  body: string;
  reactions?: ReactionSummary[];
}

// Client → server
export type ClientEvent =
  | { type: 'msg'; body: string }
  | {
      type: 'react';
      messageId: string;
      emoji: ReactionEmoji;
      op: 'add' | 'remove';
    };

// Server → client
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
