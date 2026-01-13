/**
 * Haptic feedback utility
 * Wrapper around expo-haptics for consistent haptic feedback
 */

import * as Haptics from 'expo-haptics';

/**
 * Wraps a haptic function with error handling for platforms without haptic support
 */
const withHapticFallback = <T extends unknown[]>(
  fn: (...args: T) => Promise<void>
) => {
  return async (...args: T): Promise<void> => {
    try {
      await fn(...args);
    } catch {
      // Haptics not available on this platform
    }
  };
};

/** Light impact feedback - for subtle interactions */
export const light = withHapticFallback(() =>
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
);

/** Medium impact feedback - for standard interactions */
export const medium = withHapticFallback(() =>
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
);

/** Heavy impact feedback - for significant interactions */
export const heavy = withHapticFallback(() =>
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
);

/** Success notification feedback */
export const success = withHapticFallback(() =>
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
);

/** Warning notification feedback */
export const warning = withHapticFallback(() =>
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
);

/** Error notification feedback */
export const error = withHapticFallback(() =>
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
);

/** Selection feedback - for picker/selection changes */
export const selection = withHapticFallback(() => Haptics.selectionAsync());

export const haptics = {
  light,
  medium,
  heavy,
  success,
  warning,
  error,
  selection,
} as const;
