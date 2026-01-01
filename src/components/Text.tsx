/**
 * Text component with typography variants
 * Consistent text styling across the app
 */

import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import type { ReactNode } from 'react';

export type TextVariant = 'title' | 'subtitle' | 'body' | 'caption' | 'mono';
export type TextColor = 'default' | 'muted' | 'warning' | 'danger' | 'success';
export type TextAlign = 'left' | 'center' | 'right';

export interface TextProps extends Omit<RNTextProps, 'children'> {
  variant?: TextVariant;
  color?: TextColor;
  align?: TextAlign;
  className?: string;
  children: ReactNode;
}

const variantClasses: Record<TextVariant, string> = {
  title: 'text-2xl font-bold',
  subtitle: 'text-lg font-semibold',
  body: 'text-base',
  caption: 'text-sm',
  mono: 'text-base font-mono',
};

const colorClasses: Record<TextColor, string> = {
  default: 'text-foreground',
  muted: 'text-muted',
  warning: 'text-warning',
  danger: 'text-danger',
  success: 'text-success',
};

const alignClasses: Record<TextAlign, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

// Default color per variant
const defaultColors: Record<TextVariant, TextColor> = {
  title: 'default',
  subtitle: 'default',
  body: 'default',
  caption: 'muted',
  mono: 'default',
};

export function Text({
  variant = 'body',
  color,
  align = 'left',
  className = '',
  children,
  ...props
}: TextProps) {
  const effectiveColor = color ?? defaultColors[variant];

  const classes = [
    variantClasses[variant],
    colorClasses[effectiveColor],
    alignClasses[align],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <RNText className={classes} {...props}>
      {children}
    </RNText>
  );
}
