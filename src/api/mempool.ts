/**
 * Mempool.space API client for Bitcoin price data
 */

import type { ApiResult, BitcoinPrices, MiningHashrateResponse } from '@/types';
import { fetchWithTimeout } from './client';

const BASE_URL = 'https://mempool.space';

/**
 * Get current Bitcoin prices in various currencies
 */
export async function getPrices(): Promise<ApiResult<BitcoinPrices>> {
  return fetchWithTimeout<BitcoinPrices>(`${BASE_URL}/api/v1/prices`);
}

/**
 * Get USD price only (convenience method)
 */
export async function getUsdPrice(): Promise<ApiResult<number>> {
  const result = await getPrices();

  if (result.success) {
    return { success: true, data: result.data.USD };
  }

  return result;
}

/**
 * Get the current Bitcoin network difficulty. The surrounding mining history
 * payload is intentionally discarded at the API boundary.
 */
export async function getNetworkDifficulty(): Promise<ApiResult<number>> {
  const result = await fetchWithTimeout<MiningHashrateResponse>(
    `${BASE_URL}/api/v1/mining/hashrate/1m`
  );

  if (!result.success) return result;

  const difficulty = result.data.currentDifficulty;
  if (!Number.isFinite(difficulty) || difficulty <= 0) {
    return {
      success: false,
      error: {
        message: 'Invalid network difficulty response',
        code: 'INVALID_RESPONSE',
      },
    };
  }

  return { success: true, data: difficulty };
}
