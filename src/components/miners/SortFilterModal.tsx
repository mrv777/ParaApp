/**
 * SortFilterModal - Bottom sheet for miner sort and filter options
 */

import { useCallback, useRef, useMemo, useEffect } from 'react';
import { View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetScrollView,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Text } from '../Text';
import { haptics } from '@/utils/haptics';
import { colors } from '@/constants/colors';
import type { MinerSortOption, MinerFilterOption } from '@/types';

export interface SortFilterModalProps {
  visible: boolean;
  onClose: () => void;
  sortBy: MinerSortOption;
  onSortChange: (sort: MinerSortOption) => void;
  filterBy: MinerFilterOption;
  onFilterChange: (filter: MinerFilterOption) => void;
}

interface OptionRowProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

function OptionRow({ label, selected, onPress }: OptionRowProps) {
  const handlePress = () => {
    haptics.selection();
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      className="flex-row items-center justify-between py-3 px-4"
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <Text variant="body" className={selected ? 'font-medium' : ''}>
        {label}
      </Text>
      {selected && (
        <Ionicons name="checkmark" size={20} color={colors.success} />
      )}
    </Pressable>
  );
}

const SORT_OPTIONS: { value: MinerSortOption; label: string }[] = [
  { value: 'status', label: 'Status' },
  { value: 'name', label: 'Name' },
  { value: 'hashrate', label: 'Hashrate' },
  { value: 'bestDiff', label: 'Best Diff' },
  { value: 'temp', label: 'Temperature' },
];

const FILTER_OPTIONS: { value: MinerFilterOption; label: string }[] = [
  { value: 'all', label: 'All Miners' },
  { value: 'online', label: 'Online' },
  { value: 'offline', label: 'Offline' },
  { value: 'warning', label: 'With Warnings' },
];

export function SortFilterModal({
  visible,
  onClose,
  sortBy,
  onSortChange,
  filterBy,
  onFilterChange,
}: SortFilterModalProps) {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();
  const snapPoints = useMemo(() => ['60%'], []);

  useEffect(() => {
    if (visible) {
      bottomSheetRef.current?.present();
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [visible]);

  const handleDismiss = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleSortSelect = useCallback(
    (value: MinerSortOption) => {
      onSortChange(value);
    },
    [onSortChange]
  );

  const handleFilterSelect = useCallback(
    (value: MinerFilterOption) => {
      onFilterChange(value);
    },
    [onFilterChange]
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        pressBehavior="close"
      />
    ),
    []
  );

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={snapPoints}
      onDismiss={handleDismiss}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={{ backgroundColor: colors.textMuted }}
      backgroundStyle={{ backgroundColor: colors.surface }}
    >
      <BottomSheetView style={{ flex: 1 }}>
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pb-2">
          <Text variant="subtitle" className="font-semibold">
            Sort & Filter
          </Text>
          <Pressable
            onPress={handleDismiss}
            className="p-2 -mr-2"
            hitSlop={8}
          >
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        <BottomSheetScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) }}
        >
          {/* Sort section */}
          <View className="mt-2">
            <Text
              variant="caption"
              color="muted"
              className="px-4 pb-2 uppercase"
            >
              Sort By
            </Text>
            <View className="bg-background mx-4 rounded-lg overflow-hidden">
              {SORT_OPTIONS.map((option, index) => (
                <View key={option.value}>
                  {index > 0 && <View className="h-px bg-border mx-4" />}
                  <OptionRow
                    label={option.label}
                    selected={sortBy === option.value}
                    onPress={() => handleSortSelect(option.value)}
                  />
                </View>
              ))}
            </View>
          </View>

          {/* Filter section */}
          <View className="mt-6">
            <Text
              variant="caption"
              color="muted"
              className="px-4 pb-2 uppercase"
            >
              Filter
            </Text>
            <View className="bg-background mx-4 rounded-lg overflow-hidden">
              {FILTER_OPTIONS.map((option, index) => (
                <View key={option.value}>
                  {index > 0 && <View className="h-px bg-border mx-4" />}
                  <OptionRow
                    label={option.label}
                    selected={filterBy === option.value}
                    onPress={() => handleFilterSelect(option.value)}
                  />
                </View>
              ))}
            </View>
          </View>
        </BottomSheetScrollView>
      </BottomSheetView>
    </BottomSheetModal>
  );
}
