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
import { useTranslation } from '@/i18n';

export type ConnectionStatusType = 'connected' | 'connecting' | 'offline';

export interface ConnectionStatusProps {
  status: ConnectionStatusType;
  showLabel?: boolean;
  className?: string;
}

const statusColors: Record<ConnectionStatusType, string> = {
  connected: colors.success,
  connecting: colors.warning,
  offline: colors.danger,
};

const statusLabelKeys: Record<ConnectionStatusType, string> = {
  connected: 'common.online',
  connecting: 'miners.connecting',
  offline: 'common.offline',
};

export function ConnectionStatus({
  status,
  showLabel = false,
  className = '',
}: ConnectionStatusProps) {
  const { t } = useTranslation();
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(1);

  const color = statusColors[status];
  const labelKey = statusLabelKeys[status];

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
            backgroundColor: color,
          },
          animatedDotStyle,
        ]}
      />
      {showLabel && (
        <Text variant="caption" color="muted">
          {t(labelKey)}
        </Text>
      )}
    </View>
  );
}
