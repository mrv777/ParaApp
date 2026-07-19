/**
 * User-specific polling hook
 * Fetches user stats at the configured interval (only if Bitcoin address is set)
 */

import { useCallback } from 'react';
import { useUserStore } from '@/store/userStore';
import { useSettingsStore } from '@/store/settingsStore';
import { usePolling, type UsePollingReturn } from './usePolling';

/**
 * Poll user stats (only when Bitcoin address is configured)
 * Automatically pauses when app is backgrounded
 */
export function useUserPolling(): UsePollingReturn {
  const bitcoinAddress = useSettingsStore((s) => s.bitcoinAddress);
  const fetchUserStats = useUserStore((s) => s.fetchUserStats);
  const fetchRounds = useUserStore((s) => s.fetchRounds);
  const fetchRefineryOrders = useUserStore((s) => s.fetchRefineryOrders);
  const fetchDifficultyHits = useUserStore((s) => s.fetchDifficultyHits);

  // Note: the Refinery Operator badge is effectively static, so it is fetched
  // on initial load / address change / pull-to-refresh (see HomeMainScreen and
  // refreshAll) rather than on every poll interval. Refinery orders DO poll:
  // progress/hashrate/best-share change while an order is active.
  const onPoll = useCallback(async () => {
    await Promise.all([
      fetchUserStats({ silent: true }),
      fetchRounds(),
      fetchRefineryOrders(),
      fetchDifficultyHits(),
    ]);
  }, [fetchUserStats, fetchRounds, fetchRefineryOrders, fetchDifficultyHits]);

  return usePolling({
    onPoll,
    enabled: !!bitcoinAddress,
  });
}
