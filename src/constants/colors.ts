/**
 * Color palette matching Parasite Pool website design
 * https://parasite.space
 */

export const colors = {
  // Background colors
  background: '#0a0a0a',
  surface: '#141414',
  surfaceElevated: '#1a1a1a',

  // Border colors
  border: 'rgba(237, 237, 237, 0.2)',
  borderLight: 'rgba(237, 237, 237, 0.1)',
  borderStrong: 'rgba(237, 237, 237, 0.4)',

  // Text colors
  text: '#ededed',
  textSecondary: 'rgba(237, 237, 237, 0.6)',
  textMuted: 'rgba(237, 237, 237, 0.4)',
  textDisabled: 'rgba(237, 237, 237, 0.2)',

  // Status colors
  warning: '#facc15', // Yellow - 68°C threshold
  danger: '#ef4444', // Red - 70°C+ threshold
  success: '#22c55e', // Green - online/healthy
  info: '#3b82f6', // Blue - informational

  // Interactive colors
  primary: '#ededed',
  primaryMuted: 'rgba(237, 237, 237, 0.8)',

  // Chart colors
  chartLine: '#ededed',
  chartLineSecondary: 'rgba(237, 237, 237, 0.5)',
  chartGrid: 'rgba(237, 237, 237, 0.1)',
  chartTooltipBg: '#1a1a1a',

  // Misc
  overlay: 'rgba(0, 0, 0, 0.5)',
  transparent: 'transparent',
} as const;

export type ColorName = keyof typeof colors;
