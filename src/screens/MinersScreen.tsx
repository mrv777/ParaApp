/**
 * MinersScreen - Local Bitaxe miner management
 * Includes discovery, list of miners, and miner controls
 */

import { useState, useCallback, useEffect } from 'react';
import { View, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Text } from '@/components/Text';
import { DiscoveryCard, MinerRow, EmptyMinersState } from '@/components/miners';
import {
  useMinerStore,
  selectMiners,
  selectIsDiscovering,
  selectDiscoveryProgress,
  selectDiscoveryError,
} from '@/store/minerStore';
import { colors } from '@/constants/colors';
import type { MainTabScreenProps } from '@/types/navigation';
import type { LocalMiner, DiscoveryOptions } from '@/types';

type Props = MainTabScreenProps<'Miners'>;

export function MinersScreen(_props: Props) {
  const [refreshing, setRefreshing] = useState(false);

  // Store selectors
  const miners = useMinerStore(selectMiners);
  const isDiscovering = useMinerStore(selectIsDiscovering);
  const discoveryProgress = useMinerStore(selectDiscoveryProgress);
  const discoveryError = useMinerStore(selectDiscoveryError);

  // Actions
  const startDiscovery = useMinerStore((s) => s.startDiscovery);
  const stopDiscovery = useMinerStore((s) => s.stopDiscovery);
  const addMiner = useMinerStore((s) => s.addMiner);
  const removeMiner = useMinerStore((s) => s.removeMiner);
  const refreshAllMiners = useMinerStore((s) => s.refreshAllMiners);

  // Refresh all miners on mount
  useEffect(() => {
    if (miners.length > 0) {
      refreshAllMiners();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handlers
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAllMiners();
    setRefreshing(false);
  }, [refreshAllMiners]);

  const handleStartScan = useCallback(() => {
    startDiscovery();
  }, [startDiscovery]);

  const handleStopScan = useCallback(() => {
    stopDiscovery();
  }, [stopDiscovery]);

  const handleAddManualIp = useCallback(
    async (ip: string): Promise<boolean> => {
      return await addMiner(ip);
    },
    [addMiner]
  );

  const handleScanRange = useCallback(
    (subnet: string, start: number, end: number) => {
      const options: DiscoveryOptions = {
        subnet,
        startIp: start,
        endIp: end,
      };
      startDiscovery(options);
    },
    [startDiscovery]
  );

  const handleMinerPress = useCallback((_miner: LocalMiner) => {
    // Future: Navigate to MinerDetailScreen
    // navigation.navigate('MinerDetail', { ip: miner.ip });
  }, []);

  const handleDeleteMiner = useCallback(
    (ip: string) => {
      removeMiner(ip);
    },
    [removeMiner]
  );

  const renderMiner = useCallback(
    ({ item }: { item: LocalMiner }) => (
      <MinerRow
        miner={item}
        onPress={() => handleMinerPress(item)}
        onDelete={() => handleDeleteMiner(item.ip)}
        isLoading={false}
      />
    ),
    [handleMinerPress, handleDeleteMiner]
  );

  const keyExtractor = useCallback((item: LocalMiner) => item.ip, []);

  const ListHeader = (
    <>
      {/* Screen title */}
      <View className="px-4 pt-4 pb-2">
        <Text variant="title">Miners</Text>
        {miners.length > 0 && (
          <Text variant="caption" color="muted" className="mt-1">
            {miners.filter((m) => m.isOnline).length} of {miners.length} online
          </Text>
        )}
      </View>

      {/* Discovery card */}
      <DiscoveryCard
        isDiscovering={isDiscovering}
        progress={discoveryProgress}
        discoveryError={discoveryError}
        onStartScan={handleStartScan}
        onStopScan={handleStopScan}
        onAddManualIp={handleAddManualIp}
        onScanRange={handleScanRange}
      />

      {/* Miners list header */}
      {miners.length > 0 && (
        <View className="px-4 pt-6 pb-2">
          <Text variant="caption" color="muted">
            SAVED MINERS
          </Text>
        </View>
      )}
    </>
  );

  const ListEmpty = !isDiscovering ? (
    <EmptyMinersState onStartDiscovery={handleStartScan} />
  ) : null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <FlatList
          data={miners}
          keyExtractor={keyExtractor}
          renderItem={renderMiner}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={ListEmpty}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.text}
              colors={[colors.text]}
            />
          }
        />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}
