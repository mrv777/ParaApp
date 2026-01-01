/**
 * StatItem component for displaying stats with icon, label, and value
 * Supports warning levels and trend indicators
 */

import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { colors } from '@/constants/colors';

type IoniconsName = keyof typeof Ionicons.glyphMap;

export type WarningLevel = 'none' | 'caution' | 'danger';
export type TrendDirection = 'up' | 'down' | 'neutral';
export type StatItemSize = 'sm' | 'md' | 'lg';

export interface StatItemProps {
  icon?: IoniconsName;
  label: string;
  value: string | number;
  unit?: string;
  trend?: TrendDirection;
  warningLevel?: WarningLevel;
  size?: StatItemSize;
  className?: string;
}

const warningColors: Record<WarningLevel, string> = {
  none: colors.text,
  caution: colors.warning,
  danger: colors.danger,
};

const trendIcons: Record<TrendDirection, IoniconsName> = {
  up: 'chevron-up',
  down: 'chevron-down',
  neutral: 'remove',
};

const trendColors: Record<TrendDirection, string> = {
  up: colors.success,
  down: colors.danger,
  neutral: colors.textMuted,
};

const sizeConfig: Record<
  StatItemSize,
  {
    iconSize: number;
    valueSize: string;
    labelSize: string;
    trendSize: number;
    gap: string;
  }
> = {
  sm: {
    iconSize: 16,
    valueSize: 'text-lg',
    labelSize: 'text-xs',
    trendSize: 12,
    gap: 'gap-1',
  },
  md: {
    iconSize: 20,
    valueSize: 'text-xl',
    labelSize: 'text-sm',
    trendSize: 14,
    gap: 'gap-1.5',
  },
  lg: {
    iconSize: 24,
    valueSize: 'text-2xl',
    labelSize: 'text-base',
    trendSize: 16,
    gap: 'gap-2',
  },
};

export function StatItem({
  icon,
  label,
  value,
  unit,
  trend,
  warningLevel = 'none',
  size = 'md',
  className = '',
}: StatItemProps) {
  const config = sizeConfig[size];
  const valueColor = warningColors[warningLevel];

  return (
    <View className={`${config.gap} ${className}`}>
      {/* Label row with optional icon */}
      <View className="flex-row items-center gap-1.5">
        {icon && (
          <Ionicons
            name={icon}
            size={config.iconSize}
            color={colors.textMuted}
          />
        )}
        <Text variant="caption" className={config.labelSize}>
          {label}
        </Text>
      </View>

      {/* Value row with optional unit and trend */}
      <View className="flex-row items-baseline gap-1">
        <Text
          variant="mono"
          className={`${config.valueSize} font-bold`}
          style={{ color: valueColor }}
        >
          {value}
        </Text>
        {unit && (
          <Text variant="caption" className="text-muted">
            {unit}
          </Text>
        )}
        {trend && trend !== 'neutral' && (
          <View className="ml-1">
            <Ionicons
              name={trendIcons[trend]}
              size={config.trendSize}
              color={trendColors[trend]}
            />
          </View>
        )}
      </View>
    </View>
  );
}
