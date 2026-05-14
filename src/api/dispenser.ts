/**
 * Parasite Pool Dispenser API client
 *
 * The dispenser endpoint returns 404 for addresses with no eligibility — we
 * treat that as a well-defined "no rewards" state (success with `null` data)
 * rather than a network error, so callers can render an empty UI cleanly.
 */

import type { ApiResult, Eligibility } from '@/types';
import { fetchWithTimeout } from './client';

const BASE_URL = 'https://parasite.space';

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
