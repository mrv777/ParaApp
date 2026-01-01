/**
 * Mempool.space API client for Bitcoin price data
 */

import type { ApiResult, BitcoinPrices } from '@/types';
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
