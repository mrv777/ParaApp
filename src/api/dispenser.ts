/**
 * Parasite Pool Dispenser API client
 *
 * The dispenser endpoint returns 404 for addresses with no eligibility — we
 * treat that as a well-defined "no rewards" state (success with `null` data)
 * rather than a network error, so callers can render an empty UI cleanly.
 */

import type { ApiResult, AssetInfo, Eligibility, LiveAuction, TierInfo } from '@/types';
import { fetchWithTimeout } from './client';

const BASE_URL = 'https://parasite.space';

/**
 * The standalone Parabid auction house. parastats reads this from env; there
 * is no discovery endpoint, so the app pins the known deployment.
 */
export const AUCTION_HOUSE_URL = 'https://auction.parasite.space';

export function auctionUrl(auctionId: string): string {
  return `${AUCTION_HOUSE_URL}/auction/${auctionId}`;
}

export async function getDispenserTiers(): Promise<ApiResult<TierInfo[]>> {
  return fetchWithTimeout<TierInfo[]>(`${BASE_URL}/api/dispenser/tiers`);
}

export async function getDispenserAssets(): Promise<ApiResult<AssetInfo[]>> {
  return fetchWithTimeout<AssetInfo[]>(`${BASE_URL}/api/dispenser/assets`);
}

/** Live (open/extended) auctions for dispenser assets. */
export async function getDispenserAuctions(): Promise<ApiResult<LiveAuction[]>> {
  const result = await fetchWithTimeout<LiveAuction[]>(`${BASE_URL}/api/dispenser/auctions`);
  if (result.success) {
    return { success: true, data: Array.isArray(result.data) ? result.data : [] };
  }
  return result;
}

export async function getDispenserEligibility(
  address: string
): Promise<ApiResult<Eligibility | null>> {
  const result = await fetchWithTimeout<Eligibility>(
    `${BASE_URL}/api/dispenser/eligibility/${encodeURIComponent(address)}`,
    { retries: 0 }
  );

  if (result.success) {
    return result;
  }

  if (result.error.status === 404) {
    return { success: true, data: null };
  }

  return result;
}
