/**
 * SortFilterModal - Bottom sheet for miner sort and filter options
 */

import { useCallback } from 'react';
import { View, Modal, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
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
  const handleClose = useCallback(() => {
    haptics.light();
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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Pressable
        className="flex-1 bg-black/60"
        onPress={handleClose}
      >
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
          className="flex-1"
        />
      </Pressable>

      {/* Bottom sheet content */}
      <View className="bg-secondary rounded-t-2xl pb-8">
        {/* Handle bar */}
        <View className="items-center py-3">
          <View className="w-10 h-1 bg-muted/30 rounded-full" />
        </View>

        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pb-2">
          <Text variant="subtitle" className="font-semibold">
            Sort & Filter
          </Text>
          <Pressable
            onPress={handleClose}
            className="p-2 -mr-2"
            hitSlop={8}
          >
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView className="max-h-96">
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
                  {index > 0 && (
                    <View className="h-px bg-border mx-4" />
                  )}
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
                  {index > 0 && (
                    <View className="h-px bg-border mx-4" />
                  )}
                  <OptionRow
                    label={option.label}
                    selected={filterBy === option.value}
                    onPress={() => handleFilterSelect(option.value)}
                  />
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
