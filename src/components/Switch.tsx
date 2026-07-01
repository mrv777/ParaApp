/**
 * Switch - Terminal/brutalist square toggle switch (48×28, square 20×20 knob).
 * Matches the Settings handoff spec: no radius, a light-fill "on" state, a hairline
 * "off" state, and a .16s knob slide. Reanimated drives the knob position and the
 * track/border/knob color crossfade. Visual box is smaller than 44px, so the
 * Pressable pads its hit area to meet the minimum touch target.
 */

import { Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
  interpolateColor,
  Easing,
} from 'react-native-reanimated';

// Off-state hairlines (kept literal — they don't map to a shared token).
const OFF_TRACK = 'rgba(255,255,255,0.06)';
const OFF_BORDER = 'rgba(255,255,255,0.2)';
const OFF_KNOB = '#8a8a8d';
// On-state: light fill, dark knob.
const ON_FILL = '#f4f4f5';
const ON_KNOB = '#0c0c0d';

const TRAVEL = 24; // left:2 → left:26

export interface SwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

export function Switch({ value, onValueChange, disabled = false }: SwitchProps) {
  const progress = useDerivedValue(() =>
    withTiming(value ? 1 : 0, { duration: 160, easing: Easing.inOut(Easing.ease) })
  );

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [OFF_TRACK, ON_FILL]),
    borderColor: interpolateColor(progress.value, [0, 1], [OFF_BORDER, ON_FILL]),
  }));

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * TRAVEL }],
    backgroundColor: interpolateColor(progress.value, [0, 1], [OFF_KNOB, ON_KNOB]),
  }));

  return (
    <Pressable
      onPress={() => !disabled && onValueChange(!value)}
      disabled={disabled}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      style={disabled ? { opacity: 0.5 } : undefined}
    >
      <Animated.View
        style={[
          { width: 48, height: 28, borderWidth: 1, justifyContent: 'center' },
          trackStyle,
        ]}
      >
        <Animated.View
          style={[{ position: 'absolute', left: 2, width: 20, height: 20 }, knobStyle]}
        />
      </Animated.View>
    </Pressable>
  );
}
