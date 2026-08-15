/**
 * Historical data utilities
 */

import type { HistoricalPeriod, HistoricalInterval } from '@/types';

/**
 * Get appropriate interval for a given period
 */
export function getIntervalForPeriod(
  period: HistoricalPeriod
): HistoricalInterval {
  switch (period) {
    case '1h':
      return '5m';
    case '24h':
      return '15m';
    case '7d':
      return '1h';
    // 1h is the coarsest interval the API accepts (its 30-day period cap
    // allows it); '4h' has been rejected since the Aug 2026 endpoint hardening
    case '30d':
      return '1h';
    default:
      return '15m';
  }
}
