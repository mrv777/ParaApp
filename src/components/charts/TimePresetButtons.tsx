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
}

const presets: HistoricalPeriod[] = ['1h', '24h', '7d', '30d'];

export function TimePresetButtons({
  selected,
  onSelect,
  disabled = false,
  className = '',
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
              paddingVertical: 3,
              paddingHorizontal: 7,
              backgroundColor: active ? colors.primary : 'transparent',
            }}
          >
            <Text
              variant="mono"
              style={{
                fontSize: 10,
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
