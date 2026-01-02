/**
 * Hook to compute user's rank positions from leaderboard data
 */

import { useMemo } from 'react';
import {
  usePoolStore,
  selectDifficultyLeaderboard,
  selectLoyaltyLeaderboard,
} from '@/store/poolStore';
import { useSettingsStore } from '@/store/settingsStore';
import { addressMatches } from '@/utils/address';

export interface UserRanks {
  difficultyRank: number | null; // null if not on leaderboard
  loyaltyRank: number | null;
  isLoading: boolean;
}

export function useUserRanks(): UserRanks {
  const bitcoinAddress = useSettingsStore((s) => s.bitcoinAddress);
  const difficultyLeaderboard = usePoolStore(selectDifficultyLeaderboard);
  const loyaltyLeaderboard = usePoolStore(selectLoyaltyLeaderboard);
  const isLoadingLeaderboards = usePoolStore((s) => s.isLoadingLeaderboards);

  const ranks = useMemo(() => {
    if (!bitcoinAddress) {
      return { difficultyRank: null, loyaltyRank: null };
    }

    // Find user in difficulty leaderboard (1-indexed rank)
    const difficultyIndex =
      difficultyLeaderboard?.findIndex((entry) =>
        addressMatches(entry.address, bitcoinAddress)
      ) ?? -1;

    // Find user in loyalty leaderboard (1-indexed rank)
    const loyaltyIndex =
      loyaltyLeaderboard?.findIndex((entry) =>
        addressMatches(entry.address, bitcoinAddress)
      ) ?? -1;

    return {
      difficultyRank: difficultyIndex !== -1 ? difficultyIndex + 1 : null,
      loyaltyRank: loyaltyIndex !== -1 ? loyaltyIndex + 1 : null,
    };
  }, [bitcoinAddress, difficultyLeaderboard, loyaltyLeaderboard]);

  return {
    ...ranks,
    isLoading: isLoadingLeaderboards,
  };
}
