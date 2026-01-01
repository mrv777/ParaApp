/**
 * Animation utilities using react-native-reanimated
 * Provides consistent animation configs across the app
 */

import {
  Easing,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  type WithTimingConfig,
  type WithSpringConfig,
} from 'react-native-reanimated';
import { animations } from '@/constants/theme';

/**
 * Timing configurations
 */
export const timingConfigs = {
  fast: {
    duration: animations.fast,
    easing: Easing.out(Easing.cubic),
  } satisfies WithTimingConfig,

  normal: {
    duration: animations.normal,
    easing: Easing.inOut(Easing.cubic),
  } satisfies WithTimingConfig,

  slow: {
    duration: animations.slow,
    easing: Easing.inOut(Easing.cubic),
  } satisfies WithTimingConfig,
} as const;

/**
 * Spring configurations
 */
export const springConfigs = {
  gentle: {
    damping: 20,
    stiffness: 100,
    mass: 1,
  } satisfies WithSpringConfig,

  bouncy: {
    damping: 10,
    stiffness: 150,
    mass: 0.8,
  } satisfies WithSpringConfig,

  stiff: {
    damping: 30,
    stiffness: 300,
    mass: 1,
  } satisfies WithSpringConfig,

  snappy: {
    damping: 15,
    stiffness: 200,
    mass: 0.6,
  } satisfies WithSpringConfig,
} as const;

/**
 * Easing curves for custom animations
 */
export const easings = {
  easeIn: Easing.in(Easing.cubic),
  easeOut: Easing.out(Easing.cubic),
  easeInOut: Easing.inOut(Easing.cubic),
  easeInQuad: Easing.in(Easing.quad),
  easeOutQuad: Easing.out(Easing.quad),
  linear: Easing.linear,
} as const;

/**
 * Creates a fade in animation value
 */
export const fadeIn = (
  toValue: number = 1,
  config: WithTimingConfig = timingConfigs.normal,
) => {
  'worklet';
  return withTiming(toValue, config);
};

/**
 * Creates a fade out animation value
 */
export const fadeOut = (config: WithTimingConfig = timingConfigs.normal) => {
  'worklet';
  return withTiming(0, config);
};

/**
 * Creates a spring animation to a target value
 */
export const springTo = (
  toValue: number,
  config: WithSpringConfig = springConfigs.gentle,
) => {
  'worklet';
  return withSpring(toValue, config);
};

/**
 * Creates a pulse animation (scale up and down)
 */
export const pulse = (
  minScale: number = 0.95,
  maxScale: number = 1.05,
  duration: number = 1000,
) => {
  'worklet';
  return withRepeat(
    withSequence(
      withTiming(maxScale, { duration: duration / 2 }),
      withTiming(minScale, { duration: duration / 2 }),
    ),
    -1,
    true,
  );
};

/**
 * Creates a shake animation (horizontal oscillation)
 */
export const shake = (offset: number = 10, duration: number = 400) => {
  'worklet';
  return withSequence(
    withTiming(offset, { duration: duration / 4 }),
    withTiming(-offset, { duration: duration / 4 }),
    withTiming(offset / 2, { duration: duration / 4 }),
    withTiming(0, { duration: duration / 4 }),
  );
};

/**
 * Creates a shimmer animation for skeleton loaders
 */
export const shimmer = (width: number, duration: number = 1500) => {
  'worklet';
  return withRepeat(
    withTiming(width, {
      duration,
      easing: Easing.linear,
    }),
    -1,
    false,
  );
};

/**
 * Animation presets for common use cases
 */
export const animationPresets = {
  timingConfigs,
  springConfigs,
  easings,
  fadeIn,
  fadeOut,
  springTo,
  pulse,
  shake,
  shimmer,
} as const;
