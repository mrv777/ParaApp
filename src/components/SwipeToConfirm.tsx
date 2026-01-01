/**
 * SwipeToConfirm component - Swipe gesture for dangerous actions
 * Used for restart, apply settings, and other destructive actions
 */

import { useState, useRef, useEffect } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { haptics } from '@/utils/haptics';
import { springConfigs } from '@/utils/animations';
import { colors } from '@/constants/colors';

export type SwipeToConfirmVariant = 'danger' | 'warning' | 'default';

export interface SwipeToConfirmProps {
  label?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  variant?: SwipeToConfirmVariant;
  className?: string;
}

const THUMB_SIZE = 48;
const TRACK_PADDING = 4;
const CONFIRM_THRESHOLD = 0.8;

const variantColors: Record<SwipeToConfirmVariant, { border: string; track: string }> = {
  danger: { border: 'border-danger/30', track: colors.danger },
  warning: { border: 'border-warning/30', track: colors.warning },
  default: { border: 'border-border', track: colors.text },
};

export function SwipeToConfirm({
  label = 'Swipe to confirm',
  confirmLabel = 'Confirmed!',
  onConfirm,
  disabled = false,
  variant = 'default',
  className = '',
}: SwipeToConfirmProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [isConfirmed, setIsConfirmed] = useState(false);

  const translateX = useSharedValue(0);
  const isActive = useSharedValue(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const maxTranslate = trackWidth - THUMB_SIZE - TRACK_PADDING * 2;
  const confirmThreshold = maxTranslate * CONFIRM_THRESHOLD;

  const handleConfirm = () => {
    setIsConfirmed(true);
    haptics.success();
    onConfirm();

    // Reset after a brief moment
    timeoutRef.current = setTimeout(() => {
      setIsConfirmed(false);
      translateX.value = withSpring(0, springConfigs.gentle);
    }, 1500);
  };

  const panGesture = Gesture.Pan()
    .enabled(!disabled && !isConfirmed)
    .onStart(() => {
      isActive.value = true;
    })
    .onUpdate((event) => {
      const newValue = Math.max(0, Math.min(event.translationX, maxTranslate));
      translateX.value = newValue;
    })
    .onEnd(() => {
      isActive.value = false;

      // Guard against interaction before layout measurement
      if (maxTranslate <= 0) {
        translateX.value = withSpring(0, springConfigs.bouncy);
        return;
      }

      if (translateX.value >= confirmThreshold) {
        // Confirmed - animate to end and trigger callback
        translateX.value = withSpring(maxTranslate, springConfigs.stiff);
        runOnJS(handleConfirm)();
      } else {
        // Not confirmed - spring back to start
        translateX.value = withSpring(0, springConfigs.bouncy);
      }
    });

  const labelAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [0, maxTranslate * 0.5],
      [1, 0],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  const confirmLabelAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [maxTranslate * 0.7, maxTranslate],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  const thumbScaleStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { scale: isActive.value ? withTiming(1.05, { duration: 100 }) : withTiming(1, { duration: 100 }) },
    ],
  }));

  const handleLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  const variantStyle = variantColors[variant];

  return (
    <View
      className={`h-14 bg-secondary rounded-full border ${variantStyle.border} overflow-hidden ${disabled ? 'opacity-50' : ''} ${className}`}
      onLayout={handleLayout}
    >
      {/* Background labels */}
      <View className="absolute inset-0 flex-row items-center justify-center">
        <Animated.View style={labelAnimatedStyle}>
          <Text color="muted" className="text-sm font-medium">
            {label}
          </Text>
        </Animated.View>
      </View>

      <View className="absolute inset-0 flex-row items-center justify-center">
        <Animated.View style={confirmLabelAnimatedStyle}>
          <Text color="success" className="text-sm font-bold">
            {isConfirmed ? confirmLabel : ''}
          </Text>
        </Animated.View>
      </View>

      {/* Swipeable thumb */}
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: TRACK_PADDING,
              top: TRACK_PADDING,
              width: THUMB_SIZE,
              height: THUMB_SIZE - TRACK_PADDING * 2,
              backgroundColor: colors.text,
              borderRadius: 9999,
              justifyContent: 'center',
              alignItems: 'center',
            },
            thumbScaleStyle,
          ]}
        >
          <Ionicons
            name={isConfirmed ? 'checkmark' : 'chevron-forward'}
            size={24}
            color={colors.background}
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
