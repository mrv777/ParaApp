/**
 * WorkerStatusDot - Status indicator dot for individual workers
 * Shows online/stale/offline state with optional pulse animation for stale
 */

import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '@/constants/colors';
import type { WorkerStatus } from '@/types';

export interface WorkerStatusDotProps {
  status: WorkerStatus;
  size?: 'sm' | 'md';
  className?: string;
}

const STATUS_COLORS: Record<WorkerStatus, string> = {
  online: colors.success,
  stale: colors.warning,
  offline: colors.danger,
};

const SIZE_MAP = {
  sm: 6,
  md: 8,
};

export function WorkerStatusDot({
  status,
  size = 'sm',
  className = '',
}: WorkerStatusDotProps) {
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(1);

  const dotSize = SIZE_MAP[size];
  const color = STATUS_COLORS[status];

  useEffect(() => {
    if (status === 'stale') {
      // Pulse animation for stale state to attract attention
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.3, { duration: 600 }),
          withTiming(1, { duration: 600 }),
        ),
        -1,
        false,
      );
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.5, { duration: 600 }),
          withTiming(1, { duration: 600 }),
        ),
        -1,
        false,
      );
    } else {
      // Reset to static state
      pulseScale.value = withTiming(1, { duration: 200 });
      pulseOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [status, pulseScale, pulseOpacity]);

  const animatedDotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  return (
    <View className={className}>
      <Animated.View
        style={[
          {
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: color,
          },
          animatedDotStyle,
        ]}
      />
    </View>
  );
}
