/**
 * HeaderButtons - Action buttons for miners screen header
 * Add and Sort/Filter controls
 */

import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { haptics } from '@/utils/haptics';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';
import type { MinerViewMode } from '@/types';

export interface HeaderButtonsProps {
  onAddPress: () => void;
  onSortFilterPress: () => void;
  viewMode: MinerViewMode;
  onViewModePress: () => void;
}

export function HeaderButtons({
  onAddPress,
  onSortFilterPress,
  viewMode,
  onViewModePress,
}: HeaderButtonsProps) {
  const { t } = useTranslation();

  const handleAdd = () => {
    haptics.light();
    onAddPress();
  };

  const handleSortFilter = () => {
    haptics.light();
    onSortFilterPress();
  };

  const handleViewMode = () => {
    haptics.selection();
    onViewModePress();
  };

  // Icon shows the mode you'll switch TO (action affordance).
  const isList = viewMode === 'list';

  return (
    <View className="flex-row items-center gap-1">
      {/* View mode toggle */}
      <Pressable
        onPress={handleViewMode}
        className="w-11 h-11 items-center justify-center rounded-full"
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={
          isList ? t('miners.viewAsCards') : t('miners.viewAsList')
        }
      >
        <Ionicons
          name={isList ? 'grid-outline' : 'list-outline'}
          size={22}
          color={colors.text}
        />
      </Pressable>

      {/* Add button */}
      <Pressable
        onPress={handleAdd}
        className="w-11 h-11 items-center justify-center rounded-full"
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        hitSlop={4}
      >
        <Ionicons name="add-outline" size={24} color={colors.text} />
      </Pressable>

      {/* Sort/Filter button */}
      <Pressable
        onPress={handleSortFilter}
        className="w-11 h-11 items-center justify-center rounded-full"
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        hitSlop={4}
      >
        <Ionicons name="options-outline" size={22} color={colors.text} />
      </Pressable>
    </View>
  );
}
