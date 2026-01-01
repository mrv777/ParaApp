/**
 * Card component - Surface container with consistent styling
 * Supports pressable variant with haptic feedback
 */

import { View, Pressable, type ViewProps } from 'react-native';
import type { ReactNode } from 'react';
import { haptics } from '@/utils/haptics';

export type CardVariant = 'default' | 'elevated';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps extends Omit<ViewProps, 'children'> {
  variant?: CardVariant;
  padding?: CardPadding;
  onPress?: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

const variantClasses: Record<CardVariant, string> = {
  default: 'bg-secondary rounded-xl border border-border',
  elevated: 'bg-surface-elevated rounded-xl border border-border',
};

const paddingClasses: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export function Card({
  variant = 'default',
  padding = 'md',
  onPress,
  disabled = false,
  className = '',
  children,
  ...props
}: CardProps) {
  const classes = [
    variantClasses[variant],
    paddingClasses[padding],
    disabled && 'opacity-50',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const handlePress = () => {
    if (!disabled && onPress) {
      haptics.light();
      onPress();
    }
  };

  if (onPress) {
    return (
      <Pressable
        onPress={handlePress}
        disabled={disabled}
        className={classes}
        style={({ pressed }) => ({
          opacity: pressed && !disabled ? 0.7 : 1,
        })}
        {...props}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View className={classes} {...props}>
      {children}
    </View>
  );
}
