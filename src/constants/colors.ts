/**
 * Color palette matching Parasite Pool website design
 * https://parasite.space
 */

export const colors = {
  // Background colors — terminal/brutalist
  background: '#000000', // pure-black screen
  card: '#0a0a0b', // card fill
  surface: '#0a0a0b',
  surfaceElevated: '#1c1c1e', // visible raise for skeletons / chips

  // Border colors — hairlines
  border: 'rgba(255,255,255,0.13)', // card border
  borderLight: 'rgba(255,255,255,0.07)', // row divider
  borderStrong: 'rgba(255,255,255,0.4)',

  // Text ramp
  text: '#ffffff', // hero numbers / current values
  textHigh: '#f2f2f3', // card titles
  textValue: '#e0e0e2', // table/stat values
  textSecondary: '#c8c8ca', // wallet address
  textMuted: '#8a8a8d', // labels, dimmed hashrate
  textDim: '#6a6a6c', // small-caps labels
  textFaint: '#5a5a5c', // axis labels, sub-lines
  textDisabled: 'rgba(255,255,255,0.2)',

  // Status colors — the ONLY hues in the UI
  warning: '#facc15', // miner temp warning (68°C)
  danger: '#ff5247', // worker down
  dangerTint: '#e6a5a0', // down-worker name
  success: '#37d17a', // worker up
  info: '#3b82f6', // informational

  // Interactive colors
  primary: '#f4f4f5', // active chip / light accent
  primaryMuted: 'rgba(255,255,255,0.8)',

  // Chart colors
  chartLine: '#ffffff',
  chartLineSecondary: 'rgba(255,255,255,0.5)',
  chartGrid: 'rgba(255,255,255,0.08)',
  chartTooltipBg: '#151517',

  // Misc
  overlay: 'rgba(0, 0, 0, 0.5)',
  transparent: 'transparent',
} as const;

export type ColorName = keyof typeof colors;
