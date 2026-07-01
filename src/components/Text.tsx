/**
 * Text component with typography variants
 * Consistent text styling across the app
 */

import { Text as RNText, StyleSheet, type TextProps as RNTextProps } from 'react-native';
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

// Base weight implied by each variant (overridable via font-* className)
const variantWeight: Record<TextVariant, number> = {
  title: 700,
  subtitle: 600,
  body: 400,
  caption: 400,
  mono: 400,
};

/**
 * Resolve the concrete font family. RN does not synthesize weights for custom
 * fonts, so we must pick the exact weighted family. Space Mono ships 400/700
 * only; Space Grotesk ships 400/500/600/700. Data/labels (mono, caption) use
 * Space Mono; titles/prose use Space Grotesk.
 */
function resolveFontFamily(variant: TextVariant, className: string): string {
  let weight = variantWeight[variant];
  if (/(^|\s)font-bold(\s|$)/.test(className)) weight = 700;
  else if (/(^|\s)font-semibold(\s|$)/.test(className)) weight = 600;
  else if (/(^|\s)font-medium(\s|$)/.test(className)) weight = 500;

  const isMono = variant === 'mono' || variant === 'caption';
  if (isMono) {
    return weight >= 600 ? 'SpaceMono_700Bold' : 'SpaceMono_400Regular';
  }
  if (weight >= 700) return 'SpaceGrotesk_700Bold';
  if (weight >= 600) return 'SpaceGrotesk_600SemiBold';
  if (weight >= 500) return 'SpaceGrotesk_500Medium';
  return 'SpaceGrotesk_400Regular';
}

export function Text({
  variant = 'body',
  color,
  align = 'left',
  className = '',
  style,
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

  // fontFamily set via style so the weighted family wins over className;
  // caller-supplied style still overrides (spread last).
  const fontStyle = { fontFamily: resolveFontFamily(variant, className) };

  return (
    <RNText className={classes} style={StyleSheet.flatten([fontStyle, style])} {...props}>
      {children}
    </RNText>
  );
}
