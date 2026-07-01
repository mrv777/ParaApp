/**
 * InfoSheet - Reusable help/explainer bottom sheet. Shows a title, an optional
 * intro paragraph, and a list of term/description rows. Open it from an ⓘ icon
 * placed next to a section heading.
 */

import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from './Sheet';
import { Text } from './Text';
import { colors } from '@/constants/colors';

export interface InfoItem {
  /** Short term, e.g. a column name. */
  label: string;
  /** Explanation of the term. */
  description: string;
}

export interface InfoSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Optional lead paragraph shown above the item list. */
  intro?: string;
  items?: InfoItem[];
}

export function InfoSheet({
  visible,
  onClose,
  title,
  intro,
  items,
}: InfoSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} scrollable>
      {/* Header */}
      <View className="flex-row items-center justify-between pb-2">
        <Text variant="subtitle" className="font-semibold">
          {title}
        </Text>
        <Pressable onPress={onClose} className="p-2 -mr-2" hitSlop={8}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
      </View>

      {intro ? (
        <Text variant="body" color="muted" className="mb-4">
          {intro}
        </Text>
      ) : null}

      {items && items.length > 0 ? (
        <View className="gap-3">
          {items.map((item) => (
            <View key={item.label}>
              <Text variant="body" className="font-medium">
                {item.label}
              </Text>
              <Text variant="caption" color="muted" className="mt-0.5">
                {item.description}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Sheet>
  );
}
