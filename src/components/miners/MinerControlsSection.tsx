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
import { Card } from '../Card';
import { SwipeToConfirm } from '../SwipeToConfirm';
import { useMinerStore } from '@/store/minerStore';
import { haptics } from '@/utils/haptics';
import { supportsIdentify } from '@/utils/version';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';
import type { LocalMiner, AvalonWorkMode } from '@/types';

export interface MinerControlsSectionProps {
  miner: LocalMiner;
  /** Called when restart triggers reconnecting state */
  onReconnecting?: (isReconnecting: boolean) => void;
}

const IDENTIFY_DURATION_MS = 15000; // 15 seconds
const RECONNECT_TIMEOUT_MS = 60000; // 60 seconds (AxeOS/Bitaxe reboot fast)
const RECONNECT_TIMEOUT_AVALON_MS = 240000; // 4 min — Avalon reboots are slow

export function MinerControlsSection({
  miner,
  onReconnecting,
}: MinerControlsSectionProps) {
  const { t } = useTranslation();
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const restartMiner = useMinerStore((s) => s.restartMiner);
  const identifyMiner = useMinerStore((s) => s.identifyMiner);
  const setAvalonWorkMode = useMinerStore((s) => s.setAvalonWorkMode);
  const [pendingMode, setPendingMode] = useState<AvalonWorkMode | null>(null);

  // Refs for cleanup
  const identifyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set once the miner is actually observed offline after a restart. Without
  // this, `restartMiner` never flips `isOnline`, so the clear-effect below
  // would fire immediately (miner still shows online) — instantly ending the
  // reconnecting state and firing a false "reconnected" haptic.
  const sawOfflineRef = useRef(false);

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

  // Track that we've actually seen the miner drop offline post-restart.
  useEffect(() => {
    if (isReconnecting && !miner.isOnline) {
      sawOfflineRef.current = true;
    }
  }, [miner.isOnline, isReconnecting]);

  // Clear reconnecting state once the miner has gone offline AND come back.
  // Gating on sawOfflineRef prevents the effect from firing on the very next
  // render (while the miner still reads online right after the restart call).
  useEffect(() => {
    if (isReconnecting && sawOfflineRef.current && miner.isOnline) {
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
      showError(t('errors.failedToIdentify'));
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

  const handleSetWorkMode = useCallback(
    async (mode: AvalonWorkMode) => {
      if (pendingMode !== null) return;
      setPendingMode(mode);
      dismissError();
      const ok = await setAvalonWorkMode(miner.ip, mode);
      setPendingMode(null);
      if (!ok) {
        haptics.error();
        showError(t('errors.failedToSetWorkMode'));
        return;
      }
      haptics.success();
    },
    [pendingMode, miner.ip, setAvalonWorkMode, dismissError, showError, t]
  );

  // Handle restart
  const handleRestart = useCallback(async () => {
    setIsRestarting(true);
    dismissError();

    const success = await restartMiner(miner.ip);

    if (success) {
      // Note: haptics.success() already called by SwipeToConfirm
      setIsRestarting(false);
      sawOfflineRef.current = false; // arm: wait for offline→online round trip
      setIsReconnecting(true);
      onReconnecting?.(true);

      // Set a timeout for reconnection failure. Avalon reboots take much longer
      // than AxeOS, so give them a wider window before declaring failure.
      const reconnectTimeout =
        miner.minerType === 'avalon'
          ? RECONNECT_TIMEOUT_AVALON_MS
          : RECONNECT_TIMEOUT_MS;
      reconnectTimeoutRef.current = setTimeout(() => {
        setIsReconnecting(false);
        onReconnecting?.(false);
        showError(t('errors.failedToReconnect'));
      }, reconnectTimeout);
    } else {
      haptics.error();
      setIsRestarting(false);
      showError(t('errors.failedToRestart'));
    }
  }, [miner.ip, miner.minerType, restartMiner, dismissError, showError, onReconnecting, t]);

  // Don't show controls if miner is offline (unless reconnecting)
  if (!miner.isOnline && !isReconnecting) {
    return null;
  }

  return (
    <Card padding="none">
      <Text
        variant="subtitle"
        style={{ fontSize: 15, color: colors.textHigh, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}
      >
        {t('miners.controls')}
      </Text>
      <View style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 14, gap: 12 }}>
        {/* Avalon work mode picker */}
        {miner.minerType === 'avalon' && miner.workMode !== undefined && (
          <View className="gap-2">
            <Text variant="caption" color="muted">
              {t('miners.workMode')}
            </Text>
            <View className="flex-row gap-2">
              {([0, 1, 2] as const).map((mode) => {
                const isCurrent = miner.workMode === mode;
                const isPending = pendingMode === mode;
                const label =
                  mode === 0
                    ? t('miners.workModeEco')
                    : mode === 1
                      ? t('miners.workModeStandard')
                      : t('miners.workModeSuper');
                return (
                  <Pressable
                    key={mode}
                    onPress={() => handleSetWorkMode(mode)}
                    disabled={
                      isCurrent || pendingMode !== null || isReconnecting
                    }
                    className={`flex-1 py-3 items-center ${
                      isCurrent
                        ? 'bg-foreground'
                        : 'bg-background border border-border'
                    } ${pendingMode !== null && !isPending ? 'opacity-50' : ''}`}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.7 : undefined,
                    })}
                  >
                    {isPending ? (
                      <ActivityIndicator
                        size="small"
                        color={isCurrent ? colors.background : colors.text}
                      />
                    ) : (
                      <Text
                        variant="body"
                        className={`font-medium ${isCurrent ? 'text-gray-950' : ''}`}
                      >
                        {label}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
            <Text variant="caption" color="muted">
              {t('miners.workModeRebootHint')}
            </Text>
          </View>
        )}

        {/* Identify LED Button - only for ESP-Miner v2.12.0+ */}
        {supportsIdentify(miner) && (
          <Pressable
            onPress={handleIdentify}
            disabled={isIdentifying || isReconnecting}
            className={`flex-row items-center justify-between py-3 px-4 bg-background border border-border ${
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
                  {isIdentifying ? t('miners.ledFlashing') : t('miners.identifyLed')}
                </Text>
                <Text variant="caption" color="muted">
                  {isIdentifying
                    ? t('miners.checkYourMiner')
                    : t('miners.flashLedHint')}
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
          <View className="flex-row items-center justify-center gap-3 py-4 px-4 bg-background border border-border">
            <ActivityIndicator size="small" color={colors.text} />
            <Text variant="body" color="muted">
              {t('miners.reconnecting')}
            </Text>
          </View>
        ) : isRestarting ? (
          // Restarting state
          <View className="flex-row items-center justify-center gap-3 py-4 px-4 bg-background border border-border">
            <ActivityIndicator size="small" color={colors.danger} />
            <Text variant="body" color="muted">
              {t('miners.restarting')}
            </Text>
          </View>
        ) : (
          // Swipe to restart
          <SwipeToConfirm
            label={t('miners.swipeToRestart')}
            confirmLabel={t('miners.restarting')}
            onConfirm={handleRestart}
            variant="danger"
            disabled={isIdentifying}
          />
        )}

        {/* Error Banner */}
        {error && (
          <View className="flex-row items-center justify-between py-3 px-4 bg-danger/10 border border-danger/30">
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
    </Card>
  );
}
