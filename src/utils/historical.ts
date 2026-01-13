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
    case '30d':
      return '4h';
    default:
      return '15m';
  }
}
