/**
 * Haptic feedback utility
 * Wrapper around expo-haptics for consistent haptic feedback
 */

import * as Haptics from 'expo-haptics';

/**
 * Light impact feedback - for subtle interactions
 */
export const light = async (): Promise<void> => {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Haptics not available on this platform
  }
};

/**
 * Medium impact feedback - for standard interactions
 */
export const medium = async (): Promise<void> => {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {
    // Haptics not available on this platform
  }
};

/**
 * Heavy impact feedback - for significant interactions
 */
export const heavy = async (): Promise<void> => {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  } catch {
    // Haptics not available on this platform
  }
};

/**
 * Success notification feedback
 */
export const success = async (): Promise<void> => {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // Haptics not available on this platform
  }
};

/**
 * Warning notification feedback
 */
export const warning = async (): Promise<void> => {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch {
    // Haptics not available on this platform
  }
};

/**
 * Error notification feedback
 */
export const error = async (): Promise<void> => {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch {
    // Haptics not available on this platform
  }
};

/**
 * Selection feedback - for picker/selection changes
 */
export const selection = async (): Promise<void> => {
  try {
    await Haptics.selectionAsync();
  } catch {
    // Haptics not available on this platform
  }
};

export const haptics = {
  light,
  medium,
  heavy,
  success,
  warning,
  error,
  selection,
} as const;
