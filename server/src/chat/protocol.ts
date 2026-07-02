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

/**
 * Public form of a sender address in outbound payloads (messages, react
 * actors). Full addresses stay server-side: sessions are mintable for any
 * address with pool activity (no ownership proof), so exposing full addresses
 * would let anyone post as any visible sender — including admin-assigned
 * official handles. The truncated form matches what the UI displays anyway
 * and still keys identicons / mine-detection client-side.
 */
export function truncateChatAddress(address: string): string {
  if (address.length <= 15) return address;
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

export interface ReactionSummary {
  emoji: ReactionEmoji;
  count: number;
  /** True when the requesting address is one of the reactors (history only). */
  mine?: boolean;
}

/** A message as returned by history/broadcast (reactions present once Phase 3 lands). */
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
  | { type: 'delete'; id: string } // a message was removed (admin moderation)
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
