/**
 * Badge component for status indicators
 * Used for warnings, status labels, and small tags
 */

import { View } from 'react-native';
import type { ReactNode } from 'react';
import { Text } from './Text';

export type BadgeVariant = 'default' | 'warning' | 'danger' | 'success';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
  children: ReactNode;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-secondary',
  warning: 'bg-warning/20',
  danger: 'bg-danger/20',
  success: 'bg-success/20',
};

const textColors: Record<BadgeVariant, 'default' | 'warning' | 'danger' | 'success'> = {
  default: 'default',
  warning: 'warning',
  danger: 'danger',
  success: 'success',
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0.5 rounded',
  md: 'px-2 py-1 rounded-md',
};

const textSizeClasses: Record<BadgeSize, string> = {
  sm: 'text-xs',
  md: 'text-sm',
};

export function Badge({
  variant = 'default',
  size = 'sm',
  className = '',
  children,
}: BadgeProps) {
  const classes = [variantClasses[variant], sizeClasses[size], className]
    .filter(Boolean)
    .join(' ');

  return (
    <View className={classes}>
      <Text
        color={textColors[variant]}
        className={`${textSizeClasses[size]} font-medium`}
      >
        {children}
      </Text>
    </View>
  );
}
