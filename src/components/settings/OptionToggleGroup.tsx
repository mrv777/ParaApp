/**
 * OptionToggleGroup - The app's shared square segmented control (single-select).
 * A hairline box with square segments divided by 1px left borders; the active
 * segment inverts to a light fill. Two layouts:
 *   - `inline`  (default): label on the left, a compact segmented box on the right
 *                (used for Temperature C|F).
 *   - `stacked`: label above a full-width segmented box (used for Polling Interval,
 *                Worker Sort).
 * Numeric/short labels use Space Mono 13/700; word labels use Space Grotesk 13/600
 * (`font="grotesk"`). Visual height is < 44px, so segments pad their hit area.
 */

import { View, Pressable } from 'react-native';
import { Text } from '@/components/Text';
import { haptics } from '@/utils/haptics';

// Control hairline + selected-fill text color (kept literal — spec exact values).
const CONTROL_BORDER = 'rgba(255,255,255,0.14)';
const SELECTED_BG = '#f4f4f5';
const SELECTED_TEXT = '#0c0c0d';
const UNSELECTED_TEXT = '#8a8a8d';
const LABEL_COLOR = '#f4f4f5';

export interface OptionToggleGroupProps<T extends string | number> {
  /** Array of options with value and label */
  options: { value: T; label: string }[];
  /** Currently selected value */
  selected: T;
  /** Callback when an option is selected */
  onSelect: (value: T) => void;
  /** Label displayed on the left (inline) or above (stacked) */
  label: string;
  /** `inline` = label + compact control on one row; `stacked` = full-width below label */
  layout?: 'inline' | 'stacked';
  /** Segment typeface — `mono` (numeric/short) or `grotesk` (word labels) */
  font?: 'mono' | 'grotesk';
}

export function OptionToggleGroup<T extends string | number>({
  options,
  selected,
  onSelect,
  label,
  layout = 'inline',
  font = 'mono',
}: OptionToggleGroupProps<T>) {
  const handleSelect = (value: T) => {
    if (value !== selected) {
      haptics.selection();
      onSelect(value);
    }
  };

  const stacked = layout === 'stacked';
  const isMono = font === 'mono';
  // Poll (mono) 9px vertical; Worker Sort (grotesk) 10px; inline temp 8px.
  const segPadV = stacked ? (isMono ? 9 : 10) : 8;

  const control = (
    <View
      className="flex-row"
      style={{ borderWidth: 1, borderColor: CONTROL_BORDER }}
    >
      {options.map((opt, i) => {
        const isSelected = selected === opt.value;
        return (
          <Pressable
            key={String(opt.value)}
            onPress={() => handleSelect(opt.value)}
            hitSlop={{ top: 6, bottom: 6 }}
            style={{
              flex: stacked ? 1 : undefined,
              minWidth: stacked ? undefined : 42,
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: segPadV,
              borderLeftWidth: i === 0 ? 0 : 1,
              borderLeftColor: CONTROL_BORDER,
              backgroundColor: isSelected ? SELECTED_BG : 'transparent',
            }}
          >
            <Text
              variant={isMono ? 'mono' : 'body'}
              className={isMono ? 'font-bold' : 'font-semibold'}
              style={{
                fontSize: 13,
                color: isSelected ? SELECTED_TEXT : UNSELECTED_TEXT,
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  if (stacked) {
    return (
      <View>
        <Text variant="body" style={{ fontSize: 16, color: LABEL_COLOR, marginBottom: 10 }}>
          {label}
        </Text>
        {control}
      </View>
    );
  }

  return (
    <View className="flex-row items-center justify-between">
      <Text variant="body" style={{ fontSize: 16, color: LABEL_COLOR }}>
        {label}
      </Text>
      {control}
    </View>
  );
}
