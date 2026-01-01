/**
 * MinerDetailScreen - Detailed view of a single local miner
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { View, ScrollView, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/Text';
import { Badge } from '@/components/Badge';
import {
  AliasEditSheet,
  MinerStatsSection,
  DeviceInfoSection,
  LinkedWorkerSection,
} from '@/components/miners';
import {
  useMinerStore,
  selectMiners,
} from '@/store/minerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { usePolling } from '@/hooks/usePolling';
import { haptics } from '@/utils/haptics';
import { formatTimestamp, formatDifficulty } from '@/utils/formatting';
import { colors } from '@/constants/colors';
import type { MinersStackScreenProps } from '@/types/navigation';

type Props = MinersStackScreenProps<'MinerDetail'>;

export function MinerDetailScreen({ route, navigation }: Props) {
  const { ip } = route.params;

  // State
  const [aliasSheetVisible, setAliasSheetVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Store
  const miners = useMinerStore(selectMiners);
  const refreshMiner = useMinerStore((s) => s.refreshMiner);
  const updateMinerAlias = useMinerStore((s) => s.updateMinerAlias);
  const getWarnings = useMinerStore((s) => s.getWarnings);
  const temperatureUnit = useSettingsStore((s) => s.temperatureUnit);

  // Find the miner
  const miner = useMemo(() => miners.find((m) => m.ip === ip), [miners, ip]);

  // Compute warnings
  const warnings = useMemo(
    () => (miner ? getWarnings(miner) : []),
    [miner, getWarnings]
  );

  // Navigate back if miner is removed
  useEffect(() => {
    if (!miner) {
      navigation.goBack();
    }
  }, [miner, navigation]);

  // Polling for live updates
  const onPoll = useCallback(() => refreshMiner(ip), [ip, refreshMiner]);

  usePolling({
    onPoll,
    enabled: !!miner && miner.isOnline,
    immediate: true,
  });

  // Handlers
  const handleBack = useCallback(() => {
    haptics.light();
    navigation.goBack();
  }, [navigation]);

  const handleEditAlias = useCallback(() => {
    haptics.light();
    setAliasSheetVisible(true);
  }, []);

  const handleSaveAlias = useCallback(
    (alias: string) => {
      updateMinerAlias(ip, alias);
      setAliasSheetVisible(false);
    },
    [ip, updateMinerAlias]
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshMiner(ip);
    setRefreshing(false);
    haptics.light();
  }, [ip, refreshMiner]);

  // Don't render if miner not found (will navigate back via useEffect)
  if (!miner) {
    return null;
  }

  const displayName = miner.alias || miner.hostname || miner.ip;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-border">
        <Pressable
          onPress={handleBack}
          className="p-2 -ml-2 mr-2"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text
              variant="subtitle"
              className="font-semibold"
              numberOfLines={1}
            >
              {displayName}
            </Text>
            {miner.deviceModel && (
              <Badge variant="default" size="sm">
                {miner.deviceModel}
              </Badge>
            )}
          </View>
          {!miner.isOnline && (
            <Text variant="caption" color="danger">
              Offline
            </Text>
          )}
        </View>
        <Pressable
          onPress={handleEditAlias}
          className="p-2 -mr-2"
          hitSlop={8}
        >
          <Ionicons name="pencil" size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.text}
          />
        }
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {/* Warning badges */}
        {warnings.length > 0 && (
          <View className="flex-row flex-wrap gap-2 px-4 py-3">
            {warnings.map((warning) => (
              <Badge
                key={warning.type}
                variant={warning.severity === 'danger' ? 'danger' : 'warning'}
                size="md"
              >
                {warning.message}
              </Badge>
            ))}
          </View>
        )}

        {/* Online state: show stats */}
        {miner.isOnline ? (
          <MinerStatsSection miner={miner} temperatureUnit={temperatureUnit} />
        ) : (
          /* Offline state */
          <View className="px-4 mb-4">
            <View className="bg-secondary rounded-lg p-4">
              <View className="flex-row items-center gap-2 mb-3">
                <View className="w-2 h-2 rounded-full bg-danger" />
                <Text variant="body" className="font-medium">
                  Miner is offline
                </Text>
              </View>
              <View className="gap-2">
                <View className="flex-row justify-between">
                  <Text variant="body" color="muted">
                    Last seen
                  </Text>
                  <Text variant="body">
                    {miner.lastSeen ? formatTimestamp(miner.lastSeen) : 'Never'}
                  </Text>
                </View>
                {miner.bestDiff > 0 && (
                  <View className="flex-row justify-between">
                    <Text variant="body" color="muted">
                      Last best diff
                    </Text>
                    <Text variant="body">
                      {formatDifficulty(miner.bestDiff)}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Device info */}
        <DeviceInfoSection miner={miner} />

        {/* Linked worker (conditional) */}
        <LinkedWorkerSection stratumUser={miner.stratumUser} />
      </ScrollView>

      {/* Alias edit sheet */}
      <AliasEditSheet
        visible={aliasSheetVisible}
        currentAlias={miner.alias || ''}
        hostname={miner.hostname}
        onSave={handleSaveAlias}
        onClose={() => setAliasSheetVisible(false)}
      />
    </SafeAreaView>
  );
}
