/**
 * FullScreenChartModal - Generic full-screen chart modal wrapper
 *
 * Handles shared functionality:
 * - Orientation locking (Android only - iOS causes crashes)
 * - Dimension tracking for responsive chart sizing
 * - Modal presentation with SafeAreaView
 * - Header with close button
 * - Time preset buttons
 */

import { useEffect, useCallback, useState, ReactNode } from 'react';
import {
  View,
  Modal,
  Pressable,
  StatusBar,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';

import { TimePresetButtons } from './TimePresetButtons';
import { Text } from '../Text';
import { haptics } from '@/utils/haptics';
import { formatHashrate } from '@/utils/formatting';
import { colors } from '@/constants/colors';
import type { HistoricalPeriod } from '@/types';

export interface FullScreenChartModalProps<T> {
  visible: boolean;
  onClose: () => void;
  title: string;
  data: T[];
  currentHashrate?: number;
  period: HistoricalPeriod;
  onPeriodChange: (period: HistoricalPeriod) => void;
  isLoading?: boolean;
  renderChart: (props: { data: T[]; height: number }) => ReactNode;
}

export function FullScreenChartModal<T>({
  visible,
  onClose,
  title,
  data,
  currentHashrate,
  period,
  onPeriodChange,
  isLoading = false,
  renderChart,
}: FullScreenChartModalProps<T>) {
  // Track dimensions for responsive chart sizing
  const [dimensions, setDimensions] = useState(() => Dimensions.get('window'));

  // Handle orientation (Android only - iOS orientation lock causes crashes)
  useEffect(() => {
    if (Platform.OS === 'android') {
      if (visible) {
        ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.LANDSCAPE
        ).catch(() => {});
      } else {
        ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.PORTRAIT_UP
        ).catch(() => {});
      }
      return () => {
        ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.PORTRAIT_UP
        ).catch(() => {});
      };
    }
  }, [visible]);

  // Listen for dimension changes (when user rotates device)
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions(window);
    });
    return () => subscription.remove();
  }, []);

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

  const chartHeight = dimensions.height > 0 ? dimensions.height * 0.6 : 200;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <StatusBar hidden={visible} />
      <SafeAreaView
          edges={['top', 'bottom', 'left', 'right']}
          style={{ flex: 1, backgroundColor: colors.background }}
        >
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pt-2 pb-2">
          <View className="flex-1">
            <Text variant="caption" color="muted">
              {title}
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
          {renderChart({ data, height: chartHeight })}
        </View>

        {/* Time preset buttons */}
        <View className="px-4 pb-4 pt-2">
          <TimePresetButtons
            selected={period}
            onSelect={handlePeriodChange}
            disabled={isLoading}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
