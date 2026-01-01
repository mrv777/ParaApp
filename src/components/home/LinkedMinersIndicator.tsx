/**
 * LinkedMinersIndicator - Compact indicator showing linked miners count
 * Used in WorkerRow to show how many local miners are linked to a pool worker
 */

import { useMemo } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../Text';
import { useMinerStore, selectMinersByStratumUser } from '@/store/minerStore';
import { aggregateMinerStats } from '@/utils/minerAggregation';
import { formatHashrate } from '@/utils/formatting';
import { colors } from '@/constants/colors';

export interface LinkedMinersIndicatorProps {
  workerName: string;
}

export function LinkedMinersIndicator({ workerName }: LinkedMinersIndicatorProps) {
  const selectMiners = useMemo(
    () => selectMinersByStratumUser(workerName),
    [workerName]
  );
  const miners = useMinerStore(selectMiners);

  if (miners.length === 0) {
    return null;
  }

  const aggregated = aggregateMinerStats(miners);

  return (
    <View className="flex-row items-center gap-1">
      <Ionicons name="hardware-chip-outline" size={12} color={colors.textMuted} />
      <Text variant="caption" color="muted">
        {aggregated.onlineCount}/{miners.length}
      </Text>
      {aggregated.totalHashrate > 0 && (
        <Text variant="caption" color="muted">
          ({formatHashrate(aggregated.totalHashrate * 1e9)})
        </Text>
      )}
    </View>
  );
}
