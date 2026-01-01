/**
 * MultiMinerSection - Shows aggregated stats and list of miners sharing same stratumUser
 * Used within LinkedWorkerSection when multiple miners are linked to the same worker
 */

import { View, Pressable, LayoutAnimation } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../Text';
import { Badge } from '../Badge';
import { aggregateMinerStats } from '@/utils/minerAggregation';
import { formatHashrate } from '@/utils/formatting';
import { haptics } from '@/utils/haptics';
import { colors } from '@/constants/colors';
import type { LocalMiner } from '@/types';
import type { MinersStackParamList } from '@/types/navigation';

export interface MultiMinerSectionProps {
  miners: LocalMiner[];
  currentMinerIp: string;
  expanded: boolean;
  onToggle: () => void;
}

export function MultiMinerSection({
  miners,
  currentMinerIp,
  expanded,
  onToggle,
}: MultiMinerSectionProps) {
  const navigation =
    useNavigation<NativeStackNavigationProp<MinersStackParamList>>();

  const aggregatedStats = aggregateMinerStats(miners);

  const handleToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    haptics.light();
    onToggle();
  };

  const handleNavigateToMiner = (ip: string) => {
    if (ip === currentMinerIp) return;
    haptics.light();
    navigation.push('MinerDetail', { ip });
  };

  return (
    <View className="mt-3 pt-3 border-t border-border">
      {/* Aggregated stats header */}
      <Pressable
        onPress={handleToggle}
        className="flex-row items-center justify-between"
      >
        <View>
          <Text variant="caption" color="muted">
            Combined Local Fleet ({aggregatedStats.onlineCount}/
            {aggregatedStats.minerCount} online)
          </Text>
          <Text variant="body" className="font-medium">
            {formatHashrate(aggregatedStats.totalHashrate * 1e9)}
          </Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.textMuted}
        />
      </Pressable>

      {/* Expandable miner list */}
      {expanded && (
        <View className="mt-3 gap-2">
          {miners.map((miner) => {
            const isCurrent = miner.ip === currentMinerIp;
            const displayName = miner.alias || miner.hostname || miner.ip;

            return (
              <Pressable
                key={miner.ip}
                onPress={() => handleNavigateToMiner(miner.ip)}
                disabled={isCurrent}
                className={`flex-row items-center justify-between py-2 ${
                  isCurrent ? 'opacity-60' : ''
                }`}
              >
                <View className="flex-row items-center gap-2 flex-1">
                  <View
                    className={`w-2 h-2 rounded-full ${
                      miner.isOnline ? 'bg-success' : 'bg-danger'
                    }`}
                  />
                  <Text variant="body" numberOfLines={1} className="flex-1">
                    {displayName}
                  </Text>
                  {isCurrent && (
                    <Badge variant="default" size="sm">
                      This
                    </Badge>
                  )}
                </View>
                <Text variant="mono" className="text-sm ml-2">
                  {miner.isOnline
                    ? formatHashrate(miner.hashRate * 1e9)
                    : 'Offline'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
