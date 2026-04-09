/**
 * Hook to compute user's rank positions from leaderboard data
 */

import { useMemo } from 'react';
import {
  usePoolStore,
  selectDifficultyLeaderboard,
  selectLoyaltyLeaderboard,
} from '@/store/poolStore';
import { useSettingsStore, selectRoundMode } from '@/store/settingsStore';
import { useUserStore, selectUserRounds } from '@/store/userStore';
import { addressMatches } from '@/utils/address';

export interface UserRanks {
  difficultyRank: number | null; // null if not on leaderboard
  loyaltyRank: number | null;
  isLoading: boolean;
}

export function useUserRanks(): UserRanks {
  const bitcoinAddress = useSettingsStore((s) => s.bitcoinAddress);
  const roundMode = useSettingsStore(selectRoundMode);
  const difficultyLeaderboard = usePoolStore(selectDifficultyLeaderboard);
  const loyaltyLeaderboard = usePoolStore(selectLoyaltyLeaderboard);
  const isLoadingLeaderboards = usePoolStore((s) => s.isLoadingLeaderboards);
  const userRounds = useUserStore(selectUserRounds);
  const isLoadingUser = useUserStore((s) => s.isLoading);

  const ranks = useMemo(() => {
    if (!bitcoinAddress) {
      return { difficultyRank: null, loyaltyRank: null };
    }

    if (roundMode === 'round') {
      if (!userRounds?.current_round) {
        return { difficultyRank: null, loyaltyRank: null };
      }
      return {
        difficultyRank: userRounds.current_round.rank,
        loyaltyRank: userRounds.current_round.blocks_rank,
      };
    }

    // All-time mode: find user in leaderboard arrays
    const difficultyIndex =
      difficultyLeaderboard?.findIndex((entry) =>
        addressMatches(entry.address, bitcoinAddress)
      ) ?? -1;

    const loyaltyIndex =
      loyaltyLeaderboard?.findIndex((entry) =>
        addressMatches(entry.address, bitcoinAddress)
      ) ?? -1;

    return {
      difficultyRank: difficultyIndex !== -1 ? difficultyIndex + 1 : null,
      loyaltyRank: loyaltyIndex !== -1 ? loyaltyIndex + 1 : null,
    };
  }, [bitcoinAddress, roundMode, userRounds, difficultyLeaderboard, loyaltyLeaderboard]);

  return {
    ...ranks,
    isLoading: roundMode === 'round' ? isLoadingUser : isLoadingLeaderboards,
  };
}
