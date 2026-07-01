/**
 * MultiMinerSection - Shows aggregated stats and list of miners sharing same stratumUser
 * Used within LinkedWorkerSection when multiple miners are linked to the same worker
 */

import { View, Pressable, LayoutAnimation } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../Text';
import { aggregateMinerStats } from '@/utils/minerAggregation';
import { formatHashrate } from '@/utils/formatting';
import { haptics } from '@/utils/haptics';
import { useTranslation } from '@/i18n';
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
  const { t } = useTranslation();
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
    <View className="border-t border-border-light" style={{ paddingTop: 12 }}>
      {/* Aggregated stats header */}
      <Pressable
        onPress={handleToggle}
        className="flex-row items-center justify-between"
      >
        <View style={{ gap: 2 }}>
          <Text
            variant="mono"
            className="uppercase"
            style={{ fontSize: 8, letterSpacing: 0.8, color: colors.textDim }}
          >
            {`Combined Fleet · ${aggregatedStats.onlineCount}/${aggregatedStats.minerCount} online`}
          </Text>
          <Text variant="mono" className="font-bold" style={{ fontSize: 14, color: colors.text }}>
            {formatHashrate(aggregatedStats.totalHashrate * 1e9)}
          </Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.textDim}
        />
      </Pressable>

      {/* Expandable miner list */}
      {expanded && (
        <View style={{ marginTop: 6 }}>
          {miners.map((miner) => {
            const isCurrent = miner.ip === currentMinerIp;
            const displayName = miner.alias || miner.hostname || miner.ip;

            return (
              <Pressable
                key={miner.ip}
                onPress={() => handleNavigateToMiner(miner.ip)}
                disabled={isCurrent}
                className={`flex-row items-center justify-between border-t border-border-light ${
                  isCurrent ? 'opacity-60' : 'active:opacity-70'
                }`}
                style={{ paddingVertical: 9 }}
              >
                <View className="flex-row items-center gap-2 flex-1">
                  <View
                    className={`w-2 h-2 rounded-full ${
                      miner.isOnline ? 'bg-success' : 'bg-danger'
                    }`}
                  />
                  <Text
                    variant="mono"
                    numberOfLines={1}
                    className="flex-1"
                    style={{ fontSize: 12, color: colors.textValue }}
                  >
                    {displayName}
                  </Text>
                  {isCurrent && (
                    <Text
                      variant="mono"
                      className="uppercase"
                      style={{ fontSize: 8, letterSpacing: 0.8, color: colors.textFaint }}
                    >
                      This
                    </Text>
                  )}
                </View>
                <Text
                  variant="mono"
                  className="ml-2"
                  style={{ fontSize: 12, color: miner.isOnline ? colors.textValue : colors.textFaint }}
                >
                  {miner.isOnline
                    ? formatHashrate(miner.hashRate * 1e9)
                    : t('common.offline')}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
