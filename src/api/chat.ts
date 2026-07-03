/**
 * Community chat REST client. The live message stream is a WebSocket
 * (see hooks/useChatSocket); these are the REST side-channels: mint a posting
 * session (activity-gated) and backfill history (open read).
 */

import { postJson, fetchWithTimeout, isError } from './client';
import type { ApiResult } from '@/types';
import { CHAT_HTTP_BASE, type ChatMessage } from '@/constants/chat';

/**
 * Run a token-authed REST action, re-minting the session token and retrying once
 * if it 401s. The posting token expires ~1h into a session; the open socket stays
 * valid (authed at upgrade) but REST calls need a fresh token. Returns null only
 * when there was no token to begin with.
 */
export async function runTokenAction<T>(
  token: string | null,
  refreshToken: () => Promise<string | null>,
  action: (token: string) => Promise<ApiResult<T>>
): Promise<ApiResult<T> | null> {
  if (!token) return null;
  let result = await action(token);
  if (isError(result) && result.error.status === 401) {
    const fresh = await refreshToken();
    if (fresh) result = await action(fresh);
  }
  return result;
}

interface ChatSessionResponse {
  success: boolean;
  data?: { token: string; nickname?: string | null; official?: boolean };
  error?: unknown;
}

interface ChatHistoryResponse {
  success: boolean;
  data?: { messages: ChatMessage[]; announcement?: string | null };
  error?: unknown;
}

interface ChatNicknameResponse {
  success: boolean;
  data?: { nickname: string | null };
  error?: unknown;
}

export interface BlockedChatUser {
  id: string;
  /** Truncated public address key, never the full address. */
  address: string;
  nickname: string | null;
  official?: boolean;
  createdAt: number;
}

interface ChatBlocksResponse {
  success: boolean;
  data?: { users: BlockedChatUser[] };
  error?: unknown;
}

/**
 * Exchange a pool address for a short-lived posting token. Returns a 403 (via
 * ApiError.status) when the address fails the activity gate or is banned; no
 * retries, since those are definitive answers.
 */
export async function fetchChatSession(
  btcAddress: string
): Promise<ApiResult<ChatSessionResponse>> {
  return postJson<ChatSessionResponse>(
    `${CHAT_HTTP_BASE}/chat/session`,
    { btcAddress },
    { retries: 0 }
  );
}

/**
 * Most-recent-first page. `before`/`beforeId` form an exclusive (ts, id)
 * cursor for paging back — the id tie-breaks same-millisecond messages.
 * `token` (the posting session token) enables the caller's block filtering and
 * `mine` reaction flags — the server won't accept a bare address for those.
 */
export async function fetchChatHistory(opts?: {
  before?: number;
  beforeId?: string;
  limit?: number;
  token?: string;
}): Promise<ApiResult<ChatHistoryResponse>> {
  const params = new URLSearchParams();
  if (opts?.before) params.set('before', String(opts.before));
  if (opts?.beforeId) params.set('beforeId', opts.beforeId);
  params.set('limit', String(opts?.limit ?? 50));
  if (opts?.token) params.set('token', opts.token);
  return fetchWithTimeout<ChatHistoryResponse>(
    `${CHAT_HTTP_BASE}/chat/history?${params.toString()}`,
    { retries: 1 }
  );
}

/** Set (or clear, with an empty string) the caller's moderated nickname. */
export async function putChatNickname(
  token: string,
  nickname: string
): Promise<ApiResult<ChatNicknameResponse>> {
  return fetchWithTimeout<ChatNicknameResponse>(
    `${CHAT_HTTP_BASE}/chat/nickname`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, nickname }),
      retries: 0,
    }
  );
}

interface ChatOkResponse {
  success: boolean;
  error?: unknown;
}

export async function reportChatMessage(
  token: string,
  messageId: string,
  reason: string
): Promise<ApiResult<ChatOkResponse>> {
  return postJson<ChatOkResponse>(
    `${CHAT_HTTP_BASE}/chat/report`,
    { token, messageId, reason },
    { retries: 0 }
  );
}

/**
 * Block the sender of a message. Keyed by messageId because payloads only
 * carry truncated sender keys — the server resolves the full address itself.
 */
export async function blockChatSender(
  token: string,
  messageId: string
): Promise<ApiResult<ChatOkResponse>> {
  return postJson<ChatOkResponse>(
    `${CHAT_HTTP_BASE}/chat/block`,
    { token, messageId },
    { retries: 0 }
  );
}

export async function fetchBlockedChatUsers(
  token: string
): Promise<ApiResult<ChatBlocksResponse>> {
  const params = new URLSearchParams({ token });
  return fetchWithTimeout<ChatBlocksResponse>(
    `${CHAT_HTTP_BASE}/chat/blocks?${params.toString()}`,
    { retries: 0 }
  );
}

export async function unblockChatUser(
  token: string,
  blockId: string
): Promise<ApiResult<ChatOkResponse>> {
  return fetchWithTimeout<ChatOkResponse>(`${CHAT_HTTP_BASE}/chat/block`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, blockId }),
    retries: 0,
  });
}

export async function acceptChatEula(
  token: string,
  version: string
): Promise<ApiResult<ChatOkResponse>> {
  return postJson<ChatOkResponse>(
    `${CHAT_HTTP_BASE}/chat/eula`,
    { token, version },
    { retries: 0 }
  );
}
