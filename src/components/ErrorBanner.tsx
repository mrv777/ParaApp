/**
 * ErrorBanner component for inline error display
 * Supports retry action and dismissal
 */

import { useEffect } from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Text } from './Text';
import { haptics } from '@/utils/haptics';
import { colors } from '@/constants/colors';

export interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export function ErrorBanner({
  message,
  onRetry,
  onDismiss,
  className = '',
}: ErrorBannerProps) {
  useEffect(() => {
    haptics.warning();
  }, []);

  const handleRetry = () => {
    haptics.light();
    onRetry?.();
  };

  const handleDismiss = () => {
    haptics.light();
    onDismiss?.();
  };

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      className={`bg-danger/10 border border-danger/20 rounded-lg p-3 ${className}`}
    >
      <View className="flex-row items-center gap-3">
        {/* Warning icon */}
        <Ionicons
          name="alert-circle-outline"
          size={20}
          color={colors.danger}
        />

        {/* Message */}
        <Text color="danger" className="flex-1">
          {message}
        </Text>

        {/* Retry button */}
        {onRetry && (
          <Pressable
            onPress={handleRetry}
            className="px-2 py-1"
            hitSlop={8}
          >
            <Text color="danger" className="font-medium">
              Retry
            </Text>
          </Pressable>
        )}

        {/* Dismiss button */}
        {onDismiss && (
          <Pressable
            onPress={handleDismiss}
            className="p-1"
            hitSlop={8}
          >
            <Ionicons
              name="close"
              size={18}
              color={colors.danger}
            />
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}
