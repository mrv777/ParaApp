/**
 * Shared chart utilities
 */

import type { HistoricalPeriod } from '@/types';

/**
 * Format X-axis label based on period
 * @param timestamp - Unix timestamp in milliseconds
 * @param period - Historical data period
 * @returns Formatted date/time string for chart axis
 */
export function formatXAxisLabel(
  timestamp: number,
  period: HistoricalPeriod
): string {
  const date = new Date(timestamp);

  switch (period) {
    case '1h':
    case '24h':
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
    case '7d':
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    case '30d':
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    default:
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
  }
}
