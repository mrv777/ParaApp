/**
 * NetworkBanner - Dismissible warning banner for network connectivity issues
 * Shows when all miners are unreachable
 */

import { useEffect } from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Text } from '../Text';
import { haptics } from '@/utils/haptics';
import { colors } from '@/constants/colors';

export interface NetworkBannerProps {
  visible: boolean;
  onDismiss: () => void;
  className?: string;
}

export function NetworkBanner({
  visible,
  onDismiss,
  className = '',
}: NetworkBannerProps) {
  useEffect(() => {
    if (visible) {
      haptics.warning();
    }
  }, [visible]);

  const handleDismiss = () => {
    haptics.light();
    onDismiss();
  };

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      className={`bg-warning/10 border border-warning/20 rounded-lg p-3 ${className}`}
    >
      <View className="flex-row items-center gap-3">
        {/* Wifi off icon */}
        <Ionicons name="wifi-outline" size={20} color={colors.warning} />

        {/* Message */}
        <Text color="warning" className="flex-1">
          Network unavailable - miners unreachable
        </Text>

        {/* Dismiss button */}
        <Pressable
          onPress={handleDismiss}
          className="p-1"
          hitSlop={8}
        >
          <Ionicons name="close" size={18} color={colors.warning} />
        </Pressable>
      </View>
    </Animated.View>
  );
}
