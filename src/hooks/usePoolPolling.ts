/**
 * Pool-specific polling hook
 * Fetches pool stats and Bitcoin price at the configured interval
 */

import { useCallback } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { usePoolStore } from '@/store/poolStore';
import { usePolling, type UsePollingReturn } from './usePolling';

/**
 * Poll pool stats and Bitcoin price
 * Automatically pauses when app is backgrounded
 */
export function usePoolPolling(): UsePollingReturn {
  const isFocused = useIsFocused();
  const fetchPoolStats = usePoolStore((s) => s.fetchPoolStats);
  const fetchBitcoinPrice = usePoolStore((s) => s.fetchBitcoinPrice);
  const fetchNetworkDifficulty = usePoolStore((s) => s.fetchNetworkDifficulty);

  const onPoll = useCallback(async () => {
    await Promise.all([
      fetchPoolStats({ silent: true }),
      fetchBitcoinPrice(),
      fetchNetworkDifficulty(),
    ]);
  }, [fetchPoolStats, fetchBitcoinPrice, fetchNetworkDifficulty]);

  // Tabs remain mounted when hidden; only the visible pool consumer should poll.
  return usePolling({ onPoll, enabled: isFocused });
}
