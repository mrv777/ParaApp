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

  const onPoll = useCallback(async () => {
    await fetchUserStats({ silent: true });
  }, [fetchUserStats]);

  return usePolling({
    onPoll,
    enabled: !!bitcoinAddress,
  });
}
