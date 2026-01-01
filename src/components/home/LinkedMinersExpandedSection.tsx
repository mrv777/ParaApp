/**
 * LinkedMinersExpandedSection - Shows linked miners when a WorkerRow is expanded
 * Displays list of miners with navigation to miner detail screen
 */

import { useMemo } from 'react';
import { View, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../Text';
import { useMinerStore, selectMinersByStratumUser } from '@/store/minerStore';
import { aggregateMinerStats } from '@/utils/minerAggregation';
import { formatHashrate } from '@/utils/formatting';
import { haptics } from '@/utils/haptics';
import { colors } from '@/constants/colors';

export interface LinkedMinersExpandedSectionProps {
  workerName: string;
}

export function LinkedMinersExpandedSection({
  workerName,
}: LinkedMinersExpandedSectionProps) {
  const navigation = useNavigation();
  const selectMiners = useMemo(
    () => selectMinersByStratumUser(workerName),
    [workerName]
  );
  const miners = useMinerStore(selectMiners);

  if (miners.length === 0) {
    return (
      <View className="mt-2 pt-2 border-t border-border">
        <View className="flex-row items-center gap-2">
          <Ionicons
            name="hardware-chip-outline"
            size={12}
            color={colors.textDisabled}
          />
          <Text variant="caption" color="muted">
            No local miners linked
          </Text>
        </View>
      </View>
    );
  }

  const aggregated = aggregateMinerStats(miners);

  const handleNavigateToMiner = (ip: string) => {
    haptics.light();
    // Navigate to Miners tab, then to detail
    // @ts-expect-error - nested navigation types are complex
    navigation.navigate('Miners', {
      screen: 'MinerDetail',
      params: { ip },
    });
  };

  return (
    <View className="mt-2 pt-2 border-t border-border">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-1">
          <Ionicons
            name="hardware-chip-outline"
            size={12}
            color={colors.textMuted}
          />
          <Text variant="caption" color="muted" className="uppercase">
            Linked Miners ({aggregated.onlineCount}/{aggregated.minerCount})
          </Text>
        </View>
        <Text variant="caption" color="muted">
          Local: {formatHashrate(aggregated.totalHashrate * 1e9)}
        </Text>
      </View>

      {/* Miner list */}
      {miners.map((miner) => {
        const displayName = miner.alias || miner.hostname || miner.ip;

        return (
          <Pressable
            key={miner.ip}
            onPress={() => handleNavigateToMiner(miner.ip)}
            className="flex-row items-center justify-between py-1.5"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <View className="flex-row items-center gap-2 flex-1">
              <View
                className={`w-1.5 h-1.5 rounded-full ${
                  miner.isOnline ? 'bg-success' : 'bg-danger'
                }`}
              />
              <Text variant="caption" numberOfLines={1} className="flex-1">
                {displayName}
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Text variant="caption" color="muted">
                {miner.isOnline
                  ? formatHashrate(miner.hashRate * 1e9)
                  : 'Offline'}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={12}
                color={colors.textMuted}
              />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
