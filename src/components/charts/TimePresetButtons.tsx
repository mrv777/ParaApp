/**
 * TimePresetButtons component - Horizontal button group for chart time ranges
 */

import { View } from 'react-native';
import { Button } from '../Button';
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
    <View className={`flex-row gap-2 ${className}`}>
      {presets.map((preset) => (
        <Button
          key={preset}
          variant={selected === preset ? 'secondary' : 'ghost'}
          size="sm"
          onPress={() => onSelect(preset)}
          disabled={disabled}
          className="flex-1"
        >
          {preset}
        </Button>
      ))}
    </View>
  );
}
