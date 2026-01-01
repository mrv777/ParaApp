/**
 * Button component with variants, sizes, and states
 * Includes haptic feedback and loading state
 */

import { Pressable, ActivityIndicator, View } from 'react-native';
import type { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { haptics } from '@/utils/haptics';
import { colors } from '@/constants/colors';

type IoniconsName = keyof typeof Ionicons.glyphMap;

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  icon?: IoniconsName;
  iconPosition?: 'left' | 'right';
  onPress?: () => void;
  className?: string;
  children: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-foreground',
  secondary: 'bg-secondary border border-border',
  ghost: 'bg-transparent',
  danger: 'bg-danger',
};

const variantTextColors: Record<ButtonVariant, string> = {
  primary: colors.background,
  secondary: colors.text,
  ghost: colors.text,
  danger: '#ffffff',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 rounded-md',
  md: 'px-4 py-2 rounded-lg',
  lg: 'px-6 py-3 rounded-xl',
};

const iconSizes: Record<ButtonSize, number> = {
  sm: 14,
  md: 16,
  lg: 20,
};

const textSizes: Record<ButtonSize, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  iconPosition = 'left',
  onPress,
  className = '',
  children,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const classes = [
    variantClasses[variant],
    sizeClasses[size],
    'flex-row items-center justify-center',
    isDisabled && 'opacity-50',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const handlePress = () => {
    if (!isDisabled && onPress) {
      haptics.light();
      onPress();
    }
  };

  const textColor = variantTextColors[variant];
  const iconSize = iconSizes[size];

  const renderContent = () => {
    if (loading) {
      return (
        <ActivityIndicator
          size="small"
          color={textColor}
        />
      );
    }

    const iconElement = icon ? (
      <Ionicons
        name={icon}
        size={iconSize}
        color={textColor}
      />
    ) : null;

    return (
      <View className="flex-row items-center gap-2">
        {iconPosition === 'left' && iconElement}
        <Text
          className={`${textSizes[size]} font-semibold`}
          style={{ color: textColor }}
        >
          {children}
        </Text>
        {iconPosition === 'right' && iconElement}
      </View>
    );
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      className={classes}
      style={({ pressed }) => ({
        opacity: pressed && !isDisabled ? 0.8 : 1,
      })}
    >
      {renderContent()}
    </Pressable>
  );
}
