/**
 * MinersScreen - Local Bitaxe miner management
 * Includes discovery, list of miners, and miner controls
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { View, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Text } from '@/components/Text';
import { Badge } from '@/components/Badge';
import {
  DiscoveryCard,
  MinerRow,
  EmptyMinersState,
  NetworkBanner,
  HeaderButtons,
  SortFilterModal,
} from '@/components/miners';
import {
  useMinerStore,
  selectMiners,
  selectIsDiscovering,
  selectDiscoveryProgress,
  selectDiscoveryError,
} from '@/store/minerStore';
import { colors } from '@/constants/colors';
import type { MinersStackScreenProps } from '@/types/navigation';
import type {
  LocalMiner,
  DiscoveryOptions,
  MinerSortOption,
  MinerFilterOption,
  MinerWarning,
} from '@/types';

type Props = MinersStackScreenProps<'MinersMain'>;

export function MinersScreen({ navigation }: Props) {
  const [refreshing, setRefreshing] = useState(false);

  // Sort and filter state
  const [sortBy, setSortBy] = useState<MinerSortOption>('status');
  const [filterBy, setFilterBy] = useState<MinerFilterOption>('all');
  const [showSortFilter, setShowSortFilter] = useState(false);
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Store selectors
  const miners = useMinerStore(selectMiners);
  const isDiscovering = useMinerStore(selectIsDiscovering);
  const discoveryProgress = useMinerStore(selectDiscoveryProgress);
  const discoveryError = useMinerStore(selectDiscoveryError);
  const loadingMiners = useMinerStore((s) => s.loadingMiners);

  // Actions
  const startDiscovery = useMinerStore((s) => s.startDiscovery);
  const stopDiscovery = useMinerStore((s) => s.stopDiscovery);
  const addMiner = useMinerStore((s) => s.addMiner);
  const removeMiner = useMinerStore((s) => s.removeMiner);
  const refreshAllMiners = useMinerStore((s) => s.refreshAllMiners);
  const getWarnings = useMinerStore((s) => s.getWarnings);

  // Compute if all miners are offline
  const allOffline = miners.length > 0 && miners.every((m) => !m.isOnline);
  const showNetworkBanner = allOffline && !bannerDismissed;

  // Reset banner dismissed when any miner comes online
  useEffect(() => {
    if (!allOffline && bannerDismissed) {
      setBannerDismissed(false);
    }
  }, [allOffline, bannerDismissed]);

  // Refresh all miners on mount
  useEffect(() => {
    if (miners.length > 0) {
      refreshAllMiners();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compute warnings for each miner
  const minerWarnings = useMemo(() => {
    const map = new Map<string, MinerWarning[]>();
    miners.forEach((m) => {
      map.set(m.ip, getWarnings(m));
    });
    return map;
  }, [miners, getWarnings]);

  // Sort miners with warnings first, then by selected option
  const sortedMiners = useMemo(() => {
    const withWarnings: LocalMiner[] = [];
    const withoutWarnings: LocalMiner[] = [];

    miners.forEach((m) => {
      const warnings = minerWarnings.get(m.ip) || [];
      if (warnings.length > 0) {
        withWarnings.push(m);
      } else {
        withoutWarnings.push(m);
      }
    });

    const sortFn = (a: LocalMiner, b: LocalMiner) => {
      switch (sortBy) {
        case 'hashrate':
          return b.hashRate - a.hashRate;
        case 'temp':
          return b.temp - a.temp;
        case 'status':
          return (b.isOnline ? 1 : 0) - (a.isOnline ? 1 : 0);
        case 'name':
        default: {
          const nameA = a.alias || a.hostname || a.ip;
          const nameB = b.alias || b.hostname || b.ip;
          return nameA.localeCompare(nameB);
        }
      }
    };

    return [...withWarnings.sort(sortFn), ...withoutWarnings.sort(sortFn)];
  }, [miners, minerWarnings, sortBy]);

  // Filter sorted miners
  const filteredMiners = useMemo(() => {
    return sortedMiners.filter((m) => {
      switch (filterBy) {
        case 'online':
          return m.isOnline;
        case 'offline':
          return !m.isOnline;
        case 'warning': {
          const warnings = minerWarnings.get(m.ip) || [];
          return warnings.length > 0;
        }
        case 'all':
        default:
          return true;
      }
    });
  }, [sortedMiners, filterBy, minerWarnings]);

  // Handlers
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAllMiners();
    setRefreshing(false);
  }, [refreshAllMiners]);

  const handleStartScan = useCallback(() => {
    setShowDiscovery(true);
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

  const handleMinerPress = useCallback(
    (miner: LocalMiner) => {
      navigation.navigate('MinerDetail', { ip: miner.ip });
    },
    [navigation]
  );

  const handleDeleteMiner = useCallback(
    (ip: string) => {
      removeMiner(ip);
    },
    [removeMiner]
  );

  const handleAddPress = useCallback(() => {
    setShowDiscovery(true);
  }, []);

  const handleCloseDiscovery = useCallback(() => {
    setShowDiscovery(false);
  }, []);

  const handleSortFilterPress = useCallback(() => {
    setShowSortFilter(true);
  }, []);

  const handleDismissBanner = useCallback(() => {
    setBannerDismissed(true);
  }, []);

  const renderMiner = useCallback(
    ({ item }: { item: LocalMiner }) => {
      const warnings = minerWarnings.get(item.ip);
      const isLoading = loadingMiners.has(item.ip);

      return (
        <MinerRow
          miner={item}
          warnings={warnings}
          onPress={() => handleMinerPress(item)}
          onDelete={() => handleDeleteMiner(item.ip)}
          isLoading={isLoading}
        />
      );
    },
    [handleMinerPress, handleDeleteMiner, minerWarnings, loadingMiners]
  );

  const keyExtractor = useCallback((item: LocalMiner) => item.ip, []);

  // Determine section header text
  const sectionHeader = useMemo(() => {
    switch (filterBy) {
      case 'online':
        return 'ONLINE MINERS';
      case 'offline':
        return 'OFFLINE MINERS';
      case 'warning':
        return 'MINERS WITH WARNINGS';
      default:
        return 'ALL MINERS';
    }
  }, [filterBy]);

  const ListHeader = useMemo(
    () => (
      <>
        {/* Screen title with header buttons */}
        <View className="px-4 pt-4 pb-2 flex-row items-center justify-between">
          <View className="flex-1">
            <Text variant="title">Miners</Text>
            {miners.length > 0 && (
              <Text variant="caption" color="muted" className="mt-1">
                {miners.filter((m) => m.isOnline).length} of {miners.length}{' '}
                online
              </Text>
            )}
          </View>
          <HeaderButtons
            onAddPress={handleAddPress}
            onSortFilterPress={handleSortFilterPress}
          />
        </View>

        {/* Discovery card - shown when adding or scanning */}
        {(showDiscovery || isDiscovering) && (
          <DiscoveryCard
            isDiscovering={isDiscovering}
            progress={discoveryProgress}
            discoveryError={discoveryError}
            onStartScan={handleStartScan}
            onStopScan={handleStopScan}
            onAddManualIp={handleAddManualIp}
            onScanRange={handleScanRange}
            onClose={handleCloseDiscovery}
          />
        )}

        {/* Active filter/sort indicators */}
        {(filterBy !== 'all' || sortBy !== 'status') && (
          <View className="px-4 py-2 flex-row gap-2">
            {filterBy !== 'all' && (
              <Badge variant="default" size="sm">
                {filterBy === 'warning' ? 'Warnings' : filterBy}
              </Badge>
            )}
            {sortBy !== 'status' && (
              <Badge variant="default" size="sm">
                Sort: {sortBy}
              </Badge>
            )}
          </View>
        )}

        {/* Miners list header */}
        {filteredMiners.length > 0 && (
          <View className="px-4 pt-4 pb-2">
            <Text variant="caption" color="muted">
              {sectionHeader}
            </Text>
          </View>
        )}
      </>
    ),
    [
      miners,
      isDiscovering,
      handleAddPress,
      handleStartScan,
      handleSortFilterPress,
      showDiscovery,
      discoveryProgress,
      discoveryError,
      handleStopScan,
      handleAddManualIp,
      handleScanRange,
      handleCloseDiscovery,
      filterBy,
      sortBy,
      filteredMiners.length,
      sectionHeader,
    ]
  );

  const ListEmpty = !isDiscovering ? (
    <EmptyMinersState onStartDiscovery={handleStartScan} />
  ) : null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        {/* Network banner - outside FlatList for visibility */}
        {showNetworkBanner && (
          <NetworkBanner
            visible={showNetworkBanner}
            onDismiss={handleDismissBanner}
            className="mx-4 mt-2"
          />
        )}

        <FlatList
          data={filteredMiners}
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

        {/* Sort/Filter Modal */}
        <SortFilterModal
          visible={showSortFilter}
          onClose={() => setShowSortFilter(false)}
          sortBy={sortBy}
          onSortChange={setSortBy}
          filterBy={filterBy}
          onFilterChange={setFilterBy}
        />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}
