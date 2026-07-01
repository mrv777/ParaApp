/**
 * TimePresetButtons - Brutalist segmented control for chart time ranges.
 * A single hairline box with square segments; the active segment inverts to a
 * light fill. Drives the home hashrate chart (1h / 24h / 7d / 30d).
 */

import { View, Pressable } from 'react-native';
import { Text } from '../Text';
import { colors } from '@/constants/colors';
import type { HistoricalPeriod } from '@/types';

export interface TimePresetButtonsProps {
  selected: HistoricalPeriod;
  onSelect: (preset: HistoricalPeriod) => void;
  disabled?: boolean;
  className?: string;
  /**
   * When true the control stretches to fill its container and each segment
   * shares the width evenly with centered labels (used in the full-screen
   * chart footer). Default is content-width (compact, for in-card use).
   */
  fill?: boolean;
}

const presets: HistoricalPeriod[] = ['1h', '24h', '7d', '30d'];

export function TimePresetButtons({
  selected,
  onSelect,
  disabled = false,
  className = '',
  fill = false,
}: TimePresetButtonsProps) {
  return (
    <View
      className={`flex-row border border-border ${disabled ? 'opacity-50' : ''} ${className}`}
      style={{ gap: 2 }}
    >
      {presets.map((preset) => {
        const active = selected === preset;
        return (
          <Pressable
            key={preset}
            onPress={() => !disabled && onSelect(preset)}
            disabled={disabled}
            style={{
              flex: fill ? 1 : undefined,
              alignItems: fill ? 'center' : undefined,
              paddingVertical: fill ? 8 : 3,
              paddingHorizontal: 7,
              backgroundColor: active ? colors.primary : 'transparent',
            }}
          >
            <Text
              variant="mono"
              style={{
                fontSize: fill ? 12 : 10,
                color: active ? '#000000' : colors.textDim,
              }}
            >
              {preset}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
