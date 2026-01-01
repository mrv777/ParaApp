/**
 * Pool-specific polling hook
 * Fetches pool stats and Bitcoin price at the configured interval
 */

import { useCallback } from 'react';
import { usePoolStore } from '@/store/poolStore';
import { usePolling, type UsePollingReturn } from './usePolling';

/**
 * Poll pool stats and Bitcoin price
 * Automatically pauses when app is backgrounded
 */
export function usePoolPolling(): UsePollingReturn {
  const fetchPoolStats = usePoolStore((s) => s.fetchPoolStats);
  const fetchBitcoinPrice = usePoolStore((s) => s.fetchBitcoinPrice);

  const onPoll = useCallback(async () => {
    await Promise.all([fetchPoolStats(), fetchBitcoinPrice()]);
  }, [fetchPoolStats, fetchBitcoinPrice]);

  return usePolling({ onPoll });
}
