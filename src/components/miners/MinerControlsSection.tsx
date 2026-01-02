/**
 * MinerControlsSection - Control actions for a miner
 * Includes Identify LED and Restart with confirmation
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { Text } from '../Text';
import { SwipeToConfirm } from '../SwipeToConfirm';
import { useMinerStore } from '@/store/minerStore';
import { haptics } from '@/utils/haptics';
import { supportsIdentify } from '@/utils/version';
import { colors } from '@/constants/colors';
import type { LocalMiner } from '@/types';

export interface MinerControlsSectionProps {
  miner: LocalMiner;
  /** Called when restart triggers reconnecting state */
  onReconnecting?: (isReconnecting: boolean) => void;
}

const IDENTIFY_DURATION_MS = 15000; // 15 seconds
const RECONNECT_TIMEOUT_MS = 60000; // 60 seconds

export function MinerControlsSection({
  miner,
  onReconnecting,
}: MinerControlsSectionProps) {
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const restartMiner = useMinerStore((s) => s.restartMiner);
  const identifyMiner = useMinerStore((s) => s.identifyMiner);

  // Refs for cleanup
  const identifyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pulsing animation for identify
  const pulseOpacity = useSharedValue(1);

  const pulsingStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  // Start pulsing animation
  const startPulsing = useCallback(() => {
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(0.4, { duration: 500 }),
        withTiming(1, { duration: 500 })
      ),
      -1,
      true
    );
  }, [pulseOpacity]);

  // Stop pulsing animation
  const stopPulsing = useCallback(() => {
    cancelAnimation(pulseOpacity);
    pulseOpacity.value = withTiming(1, { duration: 200 });
  }, [pulseOpacity]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (identifyTimeoutRef.current) clearTimeout(identifyTimeoutRef.current);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
      stopPulsing();
    };
  }, [stopPulsing]);

  // Clear reconnecting state when miner comes back online
  useEffect(() => {
    if (isReconnecting && miner.isOnline) {
      setIsReconnecting(false);
      onReconnecting?.(false);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      haptics.success();
    }
  }, [miner.isOnline, isReconnecting, onReconnecting]);

  // Show error with auto-dismiss
  const showError = useCallback((message: string) => {
    setError(message);
    if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    errorTimeoutRef.current = setTimeout(() => {
      setError(null);
    }, 5000);
  }, []);

  const dismissError = useCallback(() => {
    setError(null);
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = null;
    }
  }, []);

  // Handle identify LED
  const handleIdentify = useCallback(async () => {
    if (isIdentifying) return;

    setIsIdentifying(true);
    dismissError();
    startPulsing();

    const success = await identifyMiner(miner.ip);

    if (success) {
      haptics.success();
      // Keep pulsing for the identify duration
      identifyTimeoutRef.current = setTimeout(() => {
        setIsIdentifying(false);
        stopPulsing();
      }, IDENTIFY_DURATION_MS);
    } else {
      haptics.error();
      setIsIdentifying(false);
      stopPulsing();
      showError('Failed to identify miner');
    }
  }, [
    isIdentifying,
    miner.ip,
    identifyMiner,
    startPulsing,
    stopPulsing,
    dismissError,
    showError,
  ]);

  // Handle restart
  const handleRestart = useCallback(async () => {
    setIsRestarting(true);
    dismissError();

    const success = await restartMiner(miner.ip);

    if (success) {
      // Note: haptics.success() already called by SwipeToConfirm
      setIsRestarting(false);
      setIsReconnecting(true);
      onReconnecting?.(true);

      // Set a timeout for reconnection failure
      reconnectTimeoutRef.current = setTimeout(() => {
        setIsReconnecting(false);
        onReconnecting?.(false);
        showError('Miner failed to reconnect');
      }, RECONNECT_TIMEOUT_MS);
    } else {
      haptics.error();
      setIsRestarting(false);
      showError('Failed to restart miner');
    }
  }, [miner.ip, restartMiner, dismissError, showError, onReconnecting]);

  // Don't show controls if miner is offline (unless reconnecting)
  if (!miner.isOnline && !isReconnecting) {
    return null;
  }

  return (
    <View className="px-4 mb-4">
      <Text variant="caption" color="muted" className="mb-2 uppercase">
        Controls
      </Text>
      <View className="bg-secondary rounded-lg p-4 gap-3">
        {/* Identify LED Button - only for ESP-Miner v2.12.0+ */}
        {supportsIdentify(miner) && (
          <Pressable
            onPress={handleIdentify}
            disabled={isIdentifying || isReconnecting}
            className={`flex-row items-center justify-between py-3 px-4 bg-background rounded-lg ${
              isIdentifying || isReconnecting ? 'opacity-50' : 'active:opacity-70'
            }`}
          >
            <View className="flex-row items-center gap-3">
              <Animated.View style={isIdentifying ? pulsingStyle : undefined}>
                <Ionicons
                  name={isIdentifying ? 'flash' : 'flash-outline'}
                  size={24}
                  color={isIdentifying ? colors.warning : colors.text}
                />
              </Animated.View>
              <View>
                <Text variant="body" className="font-medium">
                  {isIdentifying ? 'LED Flashing...' : 'Identify LED'}
                </Text>
                <Text variant="caption" color="muted">
                  {isIdentifying
                    ? 'Check your miner'
                    : 'Flash LED to locate miner'}
                </Text>
              </View>
            </View>
            {isIdentifying && (
              <ActivityIndicator size="small" color={colors.warning} />
            )}
          </Pressable>
        )}

        {/* Restart Section */}
        {isReconnecting ? (
          // Reconnecting state
          <View className="flex-row items-center justify-center gap-3 py-4 px-4 bg-background rounded-lg">
            <ActivityIndicator size="small" color={colors.text} />
            <Text variant="body" color="muted">
              Reconnecting...
            </Text>
          </View>
        ) : isRestarting ? (
          // Restarting state
          <View className="flex-row items-center justify-center gap-3 py-4 px-4 bg-background rounded-lg">
            <ActivityIndicator size="small" color={colors.danger} />
            <Text variant="body" color="muted">
              Restarting...
            </Text>
          </View>
        ) : (
          // Swipe to restart
          <SwipeToConfirm
            label="Swipe to restart"
            confirmLabel="Restarting..."
            onConfirm={handleRestart}
            variant="danger"
            disabled={isIdentifying}
          />
        )}

        {/* Error Banner */}
        {error && (
          <View className="flex-row items-center justify-between py-3 px-4 bg-danger/10 border border-danger/30 rounded-lg">
            <View className="flex-row items-center gap-2 flex-1">
              <Ionicons
                name="alert-circle"
                size={20}
                color={colors.danger}
              />
              <Text variant="body" color="danger" className="flex-1">
                {error}
              </Text>
            </View>
            <Pressable onPress={dismissError} hitSlop={8}>
              <Ionicons name="close" size={20} color={colors.danger} />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}
