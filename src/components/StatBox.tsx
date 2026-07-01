/**
 * StatBox - The terminal/brutalist square stat cell shared across screens: a
 * hairline square with a small-caps mono label over a bold mono value, with an
 * optional dim sub-line. No radius, no fill, no icon (matches Pool/Home).
 *
 * Layout (width) is left to the caller — pass `style={{ width: '31.7%' }}` for a
 * 3-up grid, or drop it into a `flex-1` wrapper. See `PoolStatsGrid` and
 * `MinerStatsSection` for the grid usage.
 */

import { View, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { colors } from '@/constants/colors';

export type StatBoxColor = 'default' | 'warning' | 'danger' | 'success';

const VALUE_COLORS: Record<StatBoxColor, string> = {
  default: colors.text,
  warning: colors.warning,
  danger: colors.danger,
  success: colors.success,
};

export interface StatBoxProps {
  label: string;
  value: string;
  /** Dim sub-line under the value (e.g. "expected 1.2 TH/s"). */
  subValue?: string;
  /** Value color — status hues for temp/errors, else white. */
  valueColor?: StatBoxColor;
  /** Container style override — set `width` here for grid layouts. */
  style?: ViewStyle;
  className?: string;
}

export function StatBox({
  label,
  value,
  subValue,
  valueColor = 'default',
  style,
  className = '',
}: StatBoxProps) {
  return (
    <View
      className={`border border-border ${className}`}
      style={[{ paddingHorizontal: 10, paddingVertical: 9 }, style]}
    >
      <Text
        variant="mono"
        className="uppercase"
        style={{ fontSize: 8, letterSpacing: 0.8, color: colors.textDim }}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        variant="mono"
        className="font-bold"
        style={{ fontSize: 14, marginTop: 4, color: VALUE_COLORS[valueColor] }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      {subValue ? (
        <Text
          variant="mono"
          style={{ fontSize: 9, marginTop: 2, color: colors.textFaint }}
          numberOfLines={1}
        >
          {subValue}
        </Text>
      ) : null}
    </View>
  );
}
