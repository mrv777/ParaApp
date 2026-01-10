/**
 * UserFullScreenChart component - Modal overlay for landscape user hashrate chart view
 */

import { useEffect, useCallback, useState } from 'react';
import { View, Modal, Pressable, StatusBar, Dimensions, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';

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
  // Track dimensions for responsive chart sizing
  const [dimensions, setDimensions] = useState(() => Dimensions.get('window'));

  // Handle orientation (Android only - iOS orientation lock causes crashes)
  useEffect(() => {
    if (Platform.OS === 'android') {
      if (visible) {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
      } else {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      }
      return () => {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
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
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000000' }}>
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pt-2 pb-2">
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
      </SafeAreaView>
    </Modal>
  );
}
