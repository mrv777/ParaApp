/**
 * OptionToggleGroup - Reusable toggle button group for settings
 */

import { View, Pressable } from 'react-native';
import { Text } from '@/components/Text';
import { haptics } from '@/utils/haptics';

export interface OptionToggleGroupProps<T extends string | number> {
  /** Array of options with value and label */
  options: { value: T; label: string }[];
  /** Currently selected value */
  selected: T;
  /** Callback when an option is selected */
  onSelect: (value: T) => void;
  /** Label displayed on the left */
  label: string;
  /** Optional className for the button (e.g., "px-4" vs "px-3") */
  buttonClassName?: string;
}

export function OptionToggleGroup<T extends string | number>({
  options,
  selected,
  onSelect,
  label,
  buttonClassName = 'px-3',
}: OptionToggleGroupProps<T>) {
  const handleSelect = (value: T) => {
    if (value !== selected) {
      haptics.selection();
      onSelect(value);
    }
  };

  return (
    <View className="flex-row items-center justify-between">
      <Text variant="body">{label}</Text>
      <View className="flex-row bg-secondary rounded-lg overflow-hidden">
        {options.map((opt) => (
          <Pressable
            key={String(opt.value)}
            onPress={() => handleSelect(opt.value)}
            className={`${buttonClassName} py-2 ${
              selected === opt.value ? 'bg-primary' : ''
            }`}
          >
            <Text
              variant="body"
              className={
                selected === opt.value ? 'text-background font-medium' : ''
              }
            >
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
