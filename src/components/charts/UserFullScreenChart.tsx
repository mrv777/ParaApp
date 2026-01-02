/**
 * UserFullScreenChart component - Modal overlay for landscape user hashrate chart view
 */

import { useEffect, useCallback } from 'react';
import { View, Modal, Pressable, StatusBar, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { UserHashrateChart } from './UserHashrateChart';
import { TimePresetButtons } from './TimePresetButtons';
import { Text } from '../Text';
import { haptics } from '@/utils/haptics';
import { formatHashrate } from '@/utils/formatting';
import { colors } from '@/constants/colors';
import type { UserHistoricalPoint, HistoricalPeriod } from '@/types';

export interface UserFullScreenChartProps {
  visible: boolean;
  onClose: () => void;
  data: UserHistoricalPoint[];
  currentHashrate?: number;
  period: HistoricalPeriod;
  onPeriodChange: (period: HistoricalPeriod) => void;
  isLoading?: boolean;
}

export function UserFullScreenChart({
  visible,
  onClose,
  data,
  currentHashrate,
  period,
  onPeriodChange,
  isLoading = false,
}: UserFullScreenChartProps) {
  // Lock to landscape when modal opens
  useEffect(() => {
    if (visible) {
      ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.LANDSCAPE
      ).catch(() => {
        // Orientation lock may not be supported on all devices
      });
    } else {
      ScreenOrientation.unlockAsync().catch(() => {
        // Ignore unlock errors
      });
    }

    return () => {
      ScreenOrientation.unlockAsync().catch(() => {
        // Cleanup
      });
    };
  }, [visible]);

  const handleClose = useCallback(() => {
    haptics.light();
    onClose();
  }, [onClose]);

  const handlePeriodChange = useCallback(
    (newPeriod: HistoricalPeriod) => {
      haptics.selection();
      onPeriodChange(newPeriod);
    },
    [onPeriodChange]
  );

  const { width, height } = Dimensions.get('window');
  const chartHeight = Math.max(width, height) * 0.6;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <StatusBar hidden={visible} />
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(200)}
        className="flex-1 bg-background"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
          <View className="flex-1">
            <Text variant="caption" color="muted">
              Your Hashrate
            </Text>
            <Text variant="title" className="text-xl">
              {currentHashrate ? formatHashrate(currentHashrate) : '--'}
            </Text>
          </View>
          <Pressable
            onPress={handleClose}
            className="p-2 rounded-full bg-secondary"
            hitSlop={12}
          >
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        {/* Chart */}
        <View className="flex-1 px-4">
          <UserHashrateChart
            data={data}
            period={period}
            isLoading={isLoading}
            height={chartHeight}
            className="flex-1"
          />
        </View>

        {/* Time preset buttons */}
        <View className="px-4 pb-4 pt-2">
          <TimePresetButtons
            selected={period}
            onSelect={handlePeriodChange}
            disabled={isLoading}
          />
        </View>
      </Animated.View>
    </Modal>
  );
}
