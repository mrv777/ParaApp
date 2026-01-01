/**
 * WorkersListScreen - Full list of workers with expandable details
 */

import { useState, useCallback } from 'react';
import { View, FlatList, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/Text';
import { WorkerRow } from '@/components/home/WorkerRow';
import { useUserStore, selectUserWorkers, selectIsUserLoading } from '@/store/userStore';
import { haptics } from '@/utils/haptics';
import { colors } from '@/constants/colors';
import type { HomeStackScreenProps } from '@/types/navigation';
import type { UserWorker } from '@/types';

type Props = HomeStackScreenProps<'WorkersList'>;

export function WorkersListScreen({ navigation }: Props) {
  const [expandedWorker, setExpandedWorker] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Store
  const workers = useUserStore(selectUserWorkers);
  const isLoading = useUserStore(selectIsUserLoading);
  const refreshAll = useUserStore((s) => s.refreshAll);

  // Toggle expanded worker
  const handleToggleExpand = useCallback((workerName: string) => {
    setExpandedWorker((prev) => (prev === workerName ? null : workerName));
  }, []);

  // Go back
  const handleGoBack = useCallback(() => {
    haptics.light();
    navigation.goBack();
  }, [navigation]);

  // Pull-to-refresh
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  }, [refreshAll]);

  // Render worker item
  const renderItem = useCallback(
    ({ item }: { item: UserWorker }) => (
      <WorkerRow
        worker={item}
        expanded={expandedWorker === item.name}
        onToggle={() => handleToggleExpand(item.name)}
        showExpandButton
        showLinkedMiners
      />
    ),
    [expandedWorker, handleToggleExpand]
  );

  // Key extractor
  const keyExtractor = useCallback((item: UserWorker) => item.name, []);

  // Empty state
  const renderEmpty = useCallback(
    () => (
      <View className="flex-1 items-center justify-center py-20">
        <Ionicons name="hardware-chip-outline" size={48} color={colors.textMuted} />
        <Text variant="body" color="muted" className="mt-4">
          No workers found
        </Text>
        <Text variant="caption" color="muted" className="mt-1 text-center px-8">
          Workers will appear here once they submit shares to the pool
        </Text>
      </View>
    ),
    []
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-border">
        <Pressable
          onPress={handleGoBack}
          className="p-2 -ml-2 mr-2"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text variant="title" className="flex-1">
          All Workers
        </Text>
        <Text variant="caption" color="muted">
          {workers.length} total
        </Text>
      </View>

      {/* Workers List */}
      <FlatList
        data={workers}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing || isLoading}
            onRefresh={handleRefresh}
            tintColor={colors.text}
            colors={[colors.text]}
          />
        }
      />
    </SafeAreaView>
  );
}
