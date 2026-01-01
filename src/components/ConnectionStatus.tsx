/**
 * ConnectionStatus component - Subtle network status indicator
 * Shows connected/connecting/offline states with animated dot
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
import { Text } from './Text';
import { colors } from '@/constants/colors';

export type ConnectionStatusType = 'connected' | 'connecting' | 'offline';

export interface ConnectionStatusProps {
  status: ConnectionStatusType;
  showLabel?: boolean;
  className?: string;
}

const statusConfig: Record<
  ConnectionStatusType,
  { color: string; label: string }
> = {
  connected: { color: colors.success, label: 'Connected' },
  connecting: { color: colors.warning, label: 'Connecting...' },
  offline: { color: colors.danger, label: 'Offline' },
};

export function ConnectionStatus({
  status,
  showLabel = false,
  className = '',
}: ConnectionStatusProps) {
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(1);

  const config = statusConfig[status];

  useEffect(() => {
    if (status === 'connecting') {
      // Pulse animation for connecting state
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.3, { duration: 500 }),
          withTiming(1, { duration: 500 }),
        ),
        -1,
        false,
      );
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.5, { duration: 500 }),
          withTiming(1, { duration: 500 }),
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
    <View className={`flex-row items-center gap-2 ${className}`}>
      <Animated.View
        style={[
          {
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: config.color,
          },
          animatedDotStyle,
        ]}
      />
      {showLabel && (
        <Text variant="caption" color="muted">
          {config.label}
        </Text>
      )}
    </View>
  );
}
