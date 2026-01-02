/**
 * TipBanner - Subtle, dismissible inline tip component
 * Shows once per user until dismissed, then never again
 */

import { useCallback } from 'react';
import { View, Pressable } from 'react-native';
import Animated, { FadeOut, FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { Text } from './Text';
import { useSettingsStore } from '@/store/settingsStore';
import { haptics } from '@/utils/haptics';
import { colors } from '@/constants/colors';

export interface TipBannerProps {
  tipId: string;
  icon?: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
  className?: string;
}

export function TipBanner({
  tipId,
  icon = 'bulb-outline',
  children,
  className = '',
}: TipBannerProps) {
  const dismissedTips = useSettingsStore((s) => s.dismissedTips);
  const dismissTip = useSettingsStore((s) => s.dismissTip);

  const handleDismiss = useCallback(() => {
    haptics.light();
    dismissTip(tipId);
  }, [dismissTip, tipId]);

  // Don't render if already dismissed
  if (dismissedTips.includes(tipId)) {
    return null;
  }

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
    >
      <View className={`flex-row items-start px-3 py-2.5 bg-secondary/60 rounded-lg border border-border/50 ${className}`}>
        <Ionicons
          name={icon}
          size={16}
          color={colors.textMuted}
          style={{ marginTop: 2 }}
        />
        <Text
          variant="caption"
          color="muted"
          className="flex-1 ml-2 leading-5"
        >
          {children}
        </Text>
        <Pressable
          onPress={handleDismiss}
          hitSlop={8}
          className="ml-2 p-0.5"
        >
          <Ionicons name="close" size={16} color={colors.textMuted} />
        </Pressable>
      </View>
    </Animated.View>
  );
}
