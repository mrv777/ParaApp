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
  const fetchBadges = useUserStore((s) => s.fetchBadges);
  const fetchRefineryOrders = useUserStore((s) => s.fetchRefineryOrders);
  const fetchDifficultyHits = useUserStore((s) => s.fetchDifficultyHits);

  // Badges and difficulty hits change rarely, so their fetchers self-throttle
  // to a few minutes and these calls are usually no-ops. Refinery orders DO
  // poll: progress/hashrate/best-share change while an order is active.
  const onPoll = useCallback(async () => {
    await Promise.all([
      fetchUserStats({ silent: true }),
      fetchRounds(),
      fetchBadges(),
      fetchRefineryOrders(),
      fetchDifficultyHits(),
    ]);
  }, [fetchUserStats, fetchRounds, fetchBadges, fetchRefineryOrders, fetchDifficultyHits]);

  return usePolling({
    onPoll,
    enabled: !!bitcoinAddress,
  });
}
