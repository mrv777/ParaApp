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
// KBox: covers the firmware's 90s restart debounce + ~60s hash ramp. The
// NanoPi's HTTP server stays up while cgminer restarts, so the KBox may
// never be observed offline — reconnect completion is detected by an
// uptime reset instead (see the kbox effect below).
const RECONNECT_TIMEOUT_KBOX_MS = 120000;

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
  const autotuneMiner = useMinerStore((s) => s.autotuneMiner);
  const setAvalonWorkMode = useMinerStore((s) => s.setAvalonWorkMode);
  const [pendingMode, setPendingMode] = useState<AvalonWorkMode | null>(null);
  const [isAutotuning, setIsAutotuning] = useState(false);

  // Hammer v3 (`/v2/*`) exposes an on-device autotune routine.
  const supportsAutotune =
    miner.minerType === 'hammer' && miner.hammerApiVersion === 2;

  // Refs for cleanup
  const identifyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set once the miner is actually observed offline after a restart. Without
  // this, `restartMiner` never flips `isOnline`, so the clear-effect below
  // would fire immediately (miner still shows online) — instantly ending the
  // reconnecting state and firing a false "reconnected" haptic.
  const sawOfflineRef = useRef(false);
  // Single-owner guard for the reconnect outcome: both the poll-driven
  // clear-effect and the timeout's final probe check-and-clear this, so
  // whichever observes the result first handles it (no double haptic / setState).
  const reconnectingRef = useRef(false);
  // Prevents a setState after unmount from the timeout probe's async tail.
  const mountedRef = useRef(true);
  // KBox only: uptime at the moment restart was accepted. The restart is
  // confirmed done when uptime_s drops below this AND hashing resumed.
  const preRestartUptimeRef = useRef<number | null>(null);

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

  // Track mount state on its own [] effect so it flips only on real unmount
  // (the cleanup effect above re-runs whenever stopPulsing changes).
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
    if (
      isReconnecting &&
      reconnectingRef.current &&
      sawOfflineRef.current &&
      miner.isOnline
    ) {
      reconnectingRef.current = false;
      setIsReconnecting(false);
      onReconnecting?.(false);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      haptics.success();
    }
  }, [miner.isOnline, isReconnecting, onReconnecting]);

  // KBox reconnect completion: the status endpoint keeps answering during
  // the miner-process restart (only stats go null/zero), so the
  // offline→online round trip above may never trigger. Instead, clear
  // once we observe the uptime counter reset below its pre-restart value
  // AND hashrate above zero (docs: hashing resumes in ~1 min). If the
  // firmware's uptime_s turns out to measure the Pi rather than the miner
  // process, this never fires and the fixed timeout window handles it.
  useEffect(() => {
    if (
      miner.minerType === 'kbox' &&
      isReconnecting &&
      reconnectingRef.current &&
      preRestartUptimeRef.current !== null &&
      miner.uptimeSeconds > 0 &&
      miner.uptimeSeconds < preRestartUptimeRef.current &&
      miner.hashRate > 0
    ) {
      reconnectingRef.current = false;
      preRestartUptimeRef.current = null;
      setIsReconnecting(false);
      onReconnecting?.(false);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      haptics.success();
    }
  }, [
    miner.uptimeSeconds,
    miner.hashRate,
    miner.minerType,
    isReconnecting,
    onReconnecting,
  ]);

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
    t,
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

  // Handle autotune (Hammer v3). The routine runs on-device with no
  // completion signal, so we just confirm it started and let the regular
  // poll surface the freq/voltage drift.
  const handleAutotune = useCallback(async () => {
    if (isAutotuning) return;
    setIsAutotuning(true);
    dismissError();
    const ok = await autotuneMiner(miner.ip);
    setIsAutotuning(false);
    if (ok) {
      haptics.success();
    } else {
      haptics.error();
      showError(t('errors.failedToAutotune'));
    }
  }, [isAutotuning, autotuneMiner, miner.ip, dismissError, showError, t]);

  // Handle restart
  const handleRestart = useCallback(async () => {
    setIsRestarting(true);
    dismissError();

    const success = await restartMiner(miner.ip);

    if (success) {
      // Note: haptics.success() already called by SwipeToConfirm
      setIsRestarting(false);
      sawOfflineRef.current = false; // arm: wait for offline→online round trip
      // KBox: arm the uptime-reset detector instead — its HTTP server
      // stays up through the restart, so offline may never be observed.
      preRestartUptimeRef.current =
        miner.minerType === 'kbox' ? miner.uptimeSeconds : null;
      reconnectingRef.current = true;
      setIsReconnecting(true);
      onReconnecting?.(true);

      // Set a timeout for reconnection failure. Avalon and LuxOS
      // (Antminer) reboots take much longer than AxeOS, so give them a
      // wider window before declaring failure.
      const reconnectTimeout =
        miner.minerType === 'avalon' || miner.minerType === 'luxos'
          ? RECONNECT_TIMEOUT_AVALON_MS
          : miner.minerType === 'kbox'
            ? RECONNECT_TIMEOUT_KBOX_MS
            : RECONNECT_TIMEOUT_MS;
      reconnectTimeoutRef.current = setTimeout(async () => {
        // A reboot faster than the poll cycle can return before the miner is
        // ever observed offline, leaving sawOfflineRef false so the clear-effect
        // never fires. Do one final direct probe before declaring failure.
        await useMinerStore.getState().refreshMiner(miner.ip);
        if (!mountedRef.current || !reconnectingRef.current) return;
        reconnectingRef.current = false;
        const online = useMinerStore
          .getState()
          .miners.find((m) => m.ip === miner.ip)?.isOnline;
        setIsReconnecting(false);
        onReconnecting?.(false);
        if (online) {
          haptics.success();
        } else {
          showError(t('errors.failedToReconnect'));
        }
      }, reconnectTimeout);
    } else {
      haptics.error();
      setIsRestarting(false);
      // KBox rejects restarts more often than it fails them: the
      // firmware debounces to once per 90s (a 400/429 rejection).
      const storeError = useMinerStore.getState().error;
      const kboxDebounced =
        miner.minerType === 'kbox' &&
        (storeError?.code === 'debounced' ||
          storeError?.status === 400 ||
          storeError?.status === 429);
      // LuxOS: another tool may hold the miner's single config session
      const luxosSessionBusy =
        miner.minerType === 'luxos' && storeError?.code === 'session_busy';
      showError(
        kboxDebounced
          ? t('errors.kboxRestartDebounced')
          : luxosSessionBusy
            ? t('errors.luxosSessionBusy')
            : t('errors.failedToRestart')
      );
    }
  }, [miner.ip, miner.minerType, miner.uptimeSeconds, restartMiner, dismissError, showError, onReconnecting, t]);

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

        {/* Autotune Button — Hammer v3 only */}
        {supportsAutotune && (
          <Pressable
            onPress={handleAutotune}
            disabled={isAutotuning || isReconnecting}
            className={`flex-row items-center justify-between py-3 px-4 bg-background border border-border ${
              isAutotuning || isReconnecting ? 'opacity-50' : 'active:opacity-70'
            }`}
          >
            <View className="flex-row items-center gap-3">
              <Ionicons
                name="options-outline"
                size={24}
                color={colors.text}
              />
              <View>
                <Text variant="body" className="font-medium">
                  {isAutotuning ? t('miners.autotuneRunning') : t('miners.autotune')}
                </Text>
                <Text variant="caption" color="muted">
                  {t('miners.autotuneHint')}
                </Text>
              </View>
            </View>
            {isAutotuning && (
              <ActivityIndicator size="small" color={colors.text} />
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
