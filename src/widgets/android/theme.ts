import { WIDGET_STALE_AFTER_MS } from '../types';

// Shared widget palette — mirrors the colors inlined in the iOS widgets.tsx
// SwiftUI render so both platforms look identical.
export const WIDGET_COLORS = {
  bg: '#0a0a0a',
  text: '#ededed',
  muted: '#8a8a8a',
  success: '#22c55e',
  warning: '#facc15',
  danger: '#ef4444',
} as const;

// Width (dp) above which a placed widget renders the wide "medium" layout.
// Android home-screen cells are ~70dp; a 4-wide cell is comfortably past this.
export const MEDIUM_WIDTH_DP = 220;

// Deep-link targets — same URIs as the iOS widgetURL() modifiers.
export const URI_HOME = 'paraapp://home';
export const URI_POOL = 'paraapp://pool';
export const URI_SETTINGS = 'paraapp://settings';

// Badge text matching the iOS render: '' (hidden), 'No data', or 'Stale'.
export function freshnessBadge(fetchedAt: number, now: number): string {
  if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) return 'No data';
  if (now - fetchedAt > WIDGET_STALE_AFTER_MS) return 'Stale';
  return '';
}
