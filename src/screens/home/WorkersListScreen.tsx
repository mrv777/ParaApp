/**
 * WorkersListScreen - Full list of workers with sorting
 */

import { useState, useCallback, useMemo } from 'react';
import { View, FlatList, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/Text';
import { WorkerRow } from '@/components/home/WorkerRow';
import { WorkerNoteSheet } from '@/components/home/WorkerNoteSheet';
import { useUserStore, selectUserWorkers, selectIsUserLoading } from '@/store/userStore';
import {
  useSettingsStore,
  selectWorkerSortOrder,
  selectWorkerNotes,
  type WorkerSortOrder,
} from '@/store/settingsStore';
import { haptics } from '@/utils/haptics';
import { sortWorkers } from '@/utils/sorting';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';
import type { HomeStackScreenProps } from '@/types/navigation';
import type { UserWorker } from '@/types';

/** Sort order cycle: hashrate -> name -> bestDiff -> hashrate */
const SORT_ORDER_CYCLE: WorkerSortOrder[] = ['hashrate', 'name', 'bestDiff'];

/** Translation keys for sort orders */
const SORT_ORDER_KEYS: Record<WorkerSortOrder, string> = {
  hashrate: 'home.hashrate',
  name: 'common.name',
  bestDiff: 'home.bestDiff',
};

type Props = HomeStackScreenProps<'WorkersList'>;

export function WorkersListScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<UserWorker | null>(null);

  // Stores
  const workers = useUserStore(selectUserWorkers);
  const isLoading = useUserStore(selectIsUserLoading);
  const refreshAll = useUserStore((s) => s.refreshAll);
  const sortOrder = useSettingsStore(selectWorkerSortOrder);
  const setWorkerSortOrder = useSettingsStore((s) => s.setWorkerSortOrder);
  const workerNotes = useSettingsStore(selectWorkerNotes);
  const setWorkerNote = useSettingsStore((s) => s.setWorkerNote);

  // Sort workers (memoized for referential equality)
  const sortedWorkers = useMemo(
    () => sortWorkers(workers, sortOrder),
    [workers, sortOrder]
  );

  // Go back
  const handleGoBack = useCallback(() => {
    haptics.light();
    navigation.goBack();
  }, [navigation]);

  // Cycle through sort orders
  const handleCycleSort = useCallback(() => {
    haptics.selection();
    const currentIndex = SORT_ORDER_CYCLE.indexOf(sortOrder);
    const nextIndex = (currentIndex + 1) % SORT_ORDER_CYCLE.length;
    setWorkerSortOrder(SORT_ORDER_CYCLE[nextIndex]);
  }, [sortOrder, setWorkerSortOrder]);

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
        note={workerNotes[item.name]}
        onPress={() => {
          haptics.light();
          setSelectedWorker(item);
        }}
      />
    ),
    [workerNotes]
  );

  // Key extractor
  const keyExtractor = useCallback((item: UserWorker) => item.name, []);

  // Empty state
  const renderEmpty = useCallback(
    () => (
      <View className="flex-1 items-center justify-center py-20">
        <Ionicons name="hardware-chip-outline" size={48} color={colors.textMuted} />
        <Text variant="body" color="muted" className="mt-4">
          {t('home.noWorkersFound')}
        </Text>
        <Text variant="caption" color="muted" className="mt-1 text-center px-8">
          {t('home.workersAppearHintLong')}
        </Text>
      </View>
    ),
    [t]
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
          {t('home.viewAllWorkers')}
        </Text>
        {/* Sort button */}
        <Pressable
          onPress={handleCycleSort}
          className="flex-row items-center px-2 py-1 bg-secondary rounded-lg mr-2 active:opacity-70"
          hitSlop={4}
        >
          <Ionicons name="swap-vertical" size={14} color={colors.textSecondary} />
          <Text variant="caption" color="muted" className="ml-1">
            {t(SORT_ORDER_KEYS[sortOrder])}
          </Text>
        </Pressable>
        <Text variant="caption" color="muted">
          {workers.length}
        </Text>
      </View>

      {/* Workers List */}
      <FlatList
        data={sortedWorkers}
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

      {/* Note editing sheet */}
      <WorkerNoteSheet
        visible={selectedWorker !== null}
        workerName={selectedWorker?.name ?? ''}
        currentNote={selectedWorker ? (workerNotes[selectedWorker.name] ?? '') : ''}
        onSave={(note) => {
          if (selectedWorker) {
            setWorkerNote(selectedWorker.name, note);
          }
          setSelectedWorker(null);
        }}
        onClose={() => setSelectedWorker(null)}
      />
    </SafeAreaView>
  );
}
