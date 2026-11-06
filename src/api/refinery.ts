/**
 * Parasite Pool Refinery (router) API client — read-only.
 *
 * Both endpoints are public (no auth from the client). The orders endpoint
 * returns [] when the address has no orders. Unavailable services remain errors
 * so the store can preserve its last successful snapshot.
 */

import type { ApiResult, RefineryOrderDetail, RefineryOrderSummary } from '@/types';
import { fetchWithTimeout } from './client';

const BASE_URL = 'https://parasite.space';
const PAGE_SIZE = 500;
const MAX_PAGES = 20;
const POLL_TIMEOUT_MS = 10_000;

export async function getRefineryOrders(
  address: string
): Promise<ApiResult<RefineryOrderSummary[]>> {
  // Pagination shares one deadline so a large history or an upstream outage
  // cannot hold the shared user-poll cycle open indefinitely. A failed page
  // never replaces a complete cached list with a partial result.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), POLL_TIMEOUT_MS);
  const orders = new Map<number, RefineryOrderSummary>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;

  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({ address, limit: String(PAGE_SIZE) });
      if (cursor) params.set('cursor', cursor);
      let nextCursor: string | null = null;
      const result = await fetchWithTimeout<RefineryOrderSummary[]>(
        `${BASE_URL}/api/refinery/orders?${params}`,
        {
          retries: 0,
          signal: controller.signal,
          onResponseHeaders: (headers) => {
            nextCursor = headers.get('x-next-cursor');
          },
        }
      );
      if (!result.success) return result;
      if (!Array.isArray(result.data)) {
        return { success: false, error: { message: 'Invalid refinery orders response' } };
      }
      for (const order of result.data) orders.set(order.id, order);
      if (!nextCursor) return { success: true, data: [...orders.values()] };
      if (seenCursors.has(nextCursor)) {
        return { success: false, error: { message: 'Refinery pagination repeated a cursor' } };
      }
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }
    return { success: false, error: { message: 'Refinery pagination exceeded its page limit' } };
  } finally {
    clearTimeout(timer);
  }
}

export async function getRefineryOrder(
  id: number
): Promise<ApiResult<RefineryOrderDetail>> {
  return fetchWithTimeout<RefineryOrderDetail>(
    `${BASE_URL}/api/refinery/order/${id}`,
    { retries: 0 }
  );
}
