/**
 * Community chat REST client. The live message stream is a WebSocket
 * (see hooks/useChatSocket); these are the REST side-channels: mint a posting
 * session (activity-gated) and backfill history (open read).
 */

import { postJson, fetchWithTimeout } from './client';
import type { ApiResult } from '@/types';
import { CHAT_HTTP_BASE, type ChatMessage } from '@/constants/chat';

interface ChatSessionResponse {
  success: boolean;
  data?: { token: string };
  error?: unknown;
}

interface ChatHistoryResponse {
  success: boolean;
  data?: { messages: ChatMessage[] };
  error?: unknown;
}

interface ChatNicknameResponse {
  success: boolean;
  data?: { nickname: string | null };
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
 * Most-recent-first page. `before` is an exclusive ms cursor for paging back.
 * `address` flags the caller's own reactions (`mine`) in the summaries.
 */
export async function fetchChatHistory(opts?: {
  before?: number;
  limit?: number;
  address?: string;
}): Promise<ApiResult<ChatHistoryResponse>> {
  const params = new URLSearchParams();
  if (opts?.before) params.set('before', String(opts.before));
  params.set('limit', String(opts?.limit ?? 50));
  if (opts?.address) params.set('address', opts.address);
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

export async function blockChatAddress(
  token: string,
  targetAddress: string
): Promise<ApiResult<ChatOkResponse>> {
  return postJson<ChatOkResponse>(
    `${CHAT_HTTP_BASE}/chat/block`,
    { token, targetAddress },
    { retries: 0 }
  );
}

export async function unblockChatAddress(
  token: string,
  targetAddress: string
): Promise<ApiResult<ChatOkResponse>> {
  return fetchWithTimeout<ChatOkResponse>(`${CHAT_HTTP_BASE}/chat/block`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, targetAddress }),
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
