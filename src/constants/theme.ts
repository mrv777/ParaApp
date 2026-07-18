/**
 * Theme constants matching Parasite Pool website design
 * https://parasite.space
 */

import { colors } from './colors';

// Typography
export const typography = {
  // Font sizes
  sizes: {
    xs: 10,
    sm: 12,
    base: 14,
    md: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
    '5xl': 48,
  },
  // Font weights
  weights: {
    normal: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  // Line heights
  lineHeights: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;

// Spacing scale (multiples of 4)
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
} as const;

// Border radius
export const borderRadius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

// Temperature thresholds (in Celsius)
// AxeOS/Bitaxe defaults — the small ASICs throttle around 70°C.
export const tempThresholds = {
  caution: 68, // Yellow warning
  danger: 70, // Red danger
} as const;

// Avalon Q runs hot by design. TarT (firmware target) sits around 95°C
// and TMax of 85–95°C is normal under load. Only flag genuine overheat.
export const tempThresholdsAvalon = {
  caution: 98,
  danger: 102,
} as const;

// LuxOS Antminers: `temp` is chip-die based when the model has die
// sensors (tempctrl defaults ChipHot 93 / ChipDangerous 100). These
// constants are only the fallback — warnings prefer the device's own
// tempctrl limits (LocalMiner.luxosTempLimits) when reported, which
// also covers board-sensor-only models whose limits are far lower.
export const tempThresholdsLuxOS = {
  caution: 93,
  danger: 100,
} as const;

export function getTempThresholdsFor(minerType?: string) {
  // KBox deliberately uses the default BM1370 thresholds: its firmware
  // has a 70°C overclock watchdog, so 68/70 matches its own limits.
  if (minerType === 'avalon') return tempThresholdsAvalon;
  if (minerType === 'luxos') return tempThresholdsLuxOS;
  return tempThresholds;
}

// Polling intervals (in milliseconds)
export const pollingIntervals = {
  fast: 5000,
  normal: 10000,
  slow: 20000,
  verySlow: 30000,
} as const;

// API timeouts
export const timeouts = {
  miner: 5000, // 5 seconds for local miner requests
  api: 10000, // 10 seconds for remote API requests
} as const;

// Animation durations (in milliseconds)
export const animations = {
  fast: 150,
  normal: 300,
  slow: 500,
} as const;

// Export combined theme object
export const theme = {
  colors,
  typography,
  spacing,
  borderRadius,
  tempThresholds,
  pollingIntervals,
  timeouts,
  animations,
} as const;

export type Theme = typeof theme;
