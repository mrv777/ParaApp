/**
 * Parasite Pool Refinery (router) API client — read-only.
 *
 * Both endpoints are public (no auth from the client). The orders endpoint
 * returns [] when the address has no orders or the router is unconfigured,
 * which callers use to hide the Refinery UI entirely.
 */

import type { ApiResult, RefineryOrderDetail, RefineryOrderSummary } from '@/types';
import { fetchWithTimeout } from './client';

const BASE_URL = 'https://parasite.space';

export async function getRefineryOrders(
  address: string
): Promise<ApiResult<RefineryOrderSummary[]>> {
  return fetchWithTimeout<RefineryOrderSummary[]>(
    `${BASE_URL}/api/router/orders?address=${encodeURIComponent(address)}`
  );
}

export async function getRefineryOrder(
  id: number
): Promise<ApiResult<RefineryOrderDetail>> {
  return fetchWithTimeout<RefineryOrderDetail>(
    `${BASE_URL}/api/router/order/${id}`
  );
}
