/**
 * HeaderButtons - Action buttons for miners screen header
 * Add and Sort/Filter controls
 */

import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { haptics } from '@/utils/haptics';
import { colors } from '@/constants/colors';

export interface HeaderButtonsProps {
  onAddPress: () => void;
  onSortFilterPress: () => void;
}

export function HeaderButtons({
  onAddPress,
  onSortFilterPress,
}: HeaderButtonsProps) {
  const handleAdd = () => {
    haptics.light();
    onAddPress();
  };

  const handleSortFilter = () => {
    haptics.light();
    onSortFilterPress();
  };

  return (
    <View className="flex-row items-center gap-1">
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
