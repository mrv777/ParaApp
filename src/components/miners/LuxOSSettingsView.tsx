/**
 * LuxOSSettingsView - Settings body for Antminers running LuxOS.
 *
 * Rendered by MinerSettingsScreen in place of the AxeOS form (same
 * handoff pattern as AvalonSettingsView / KBoxSettingsView). Drives the
 * LuxOS local API via the store actions:
 *  - Power profile: Luxor-validated presets from the device's own
 *    `profiles` list (no raw frequency/voltage tuning).
 *  - Locate LED: persistent red-LED blink toggle (`ledset`).
 *  - Pools: add / make-primary / remove via the session-less cgminer
 *    pool commands.
 *
 * Each section is self-contained so individual controls can be removed
 * without refactoring. Written doc-driven without hardware — every
 * action surfaces the firmware's error message verbatim on failure.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../Text';
import { ErrorBanner } from '../ErrorBanner';
import { useMinerStore } from '@/store/minerStore';
import { luxos, isSuccess } from '@/api';
import { haptics } from '@/utils/haptics';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';
import type { LocalMiner, ApiResult } from '@/types';

export interface LuxOSSettingsViewProps {
  miner: LocalMiner;
}

const inputStyle = {
  paddingHorizontal: 12,
  paddingVertical: 10,
  color: colors.text,
  fontSize: 15,
  backgroundColor: colors.background,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: colors.border,
} as const;

function SectionLabel({ children }: { children: string }) {
  return (
    <Text variant="caption" color="muted" className="uppercase tracking-wide mb-3">
      {children}
    </Text>
  );
}

function Hint({ children }: { children: string }) {
  return (
    <Text variant="caption" color="muted" className="mt-2">
      {children}
    </Text>
  );
}

export function LuxOSSettingsView({ miner }: LuxOSSettingsViewProps) {
  const { t } = useTranslation();
  const ip = miner.ip;

  const setLuxOSProfile = useMinerStore((s) => s.setLuxOSProfile);
  const setLuxOSLocate = useMinerStore((s) => s.setLuxOSLocate);
  const addLuxOSPool = useMinerStore((s) => s.addLuxOSPool);
  const removeLuxOSPool = useMinerStore((s) => s.removeLuxOSPool);
  const switchLuxOSPool = useMinerStore((s) => s.switchLuxOSPool);

  // One action in flight at a time; the string identifies which control
  // shows the spinner (e.g. "profile:default", "pool:switch:1").
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // --- Pools (fetched here; the monitoring snapshot only carries the
  // active pool's user/url on the LocalMiner) ---
  const [pools, setPools] = useState<luxos.LuxOSPool[] | null>(null);
  const [poolsLoading, setPoolsLoading] = useState(true);
  const [poolsError, setPoolsError] = useState(false);

  // --- Add-pool form ---
  const [addOpen, setAddOpen] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newUser, setNewUser] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const loadPools = useCallback(async () => {
    setPoolsLoading(true);
    setPoolsError(false);
    const result = await luxos.getPools(ip);
    if (isSuccess(result)) {
      setPools(result.data);
    } else {
      setPoolsError(true);
    }
    setPoolsLoading(false);
  }, [ip]);

  useEffect(() => {
    void loadPools();
  }, [loadPools]);

  /** Shared busy/error handling — every control funnels through here */
  const runAction = useCallback(
    async (
      actionId: string,
      action: () => Promise<ApiResult<void>>
    ): Promise<boolean> => {
      if (busyAction) return false;
      setBusyAction(actionId);
      setError(null);
      haptics.light();
      const result = await action();
      setBusyAction(null);
      if (result.success) {
        haptics.success();
        return true;
      }
      haptics.error();
      setError(
        result.error.code === 'session_busy'
          ? t('errors.luxosSessionBusy')
          : result.error.message || t('errors.failedToApply')
      );
      return false;
    },
    [busyAction, t]
  );

  const handleSelectProfile = useCallback(
    (name: string) => {
      if (name === miner.luxosProfile) return;
      void runAction(`profile:${name}`, () => setLuxOSProfile(ip, name));
    },
    [runAction, setLuxOSProfile, ip, miner.luxosProfile]
  );

  const locateOn = miner.luxosRedLed === 'blink';
  const handleLocate = useCallback(
    (on: boolean) => {
      if (on === locateOn) return;
      void runAction(`locate:${on}`, () => setLuxOSLocate(ip, on));
    },
    [runAction, setLuxOSLocate, ip, locateOn]
  );

  const handleAddPool = useCallback(() => {
    const url = newUrl.trim();
    const user = newUser.trim();
    if (!url || !user) return;
    void runAction('pool:add', () =>
      addLuxOSPool(ip, url, user, newPassword.trim() || undefined)
    ).then((ok) => {
      if (ok) {
        setNewUrl('');
        setNewUser('');
        setNewPassword('');
        setAddOpen(false);
        void loadPools();
      }
    });
  }, [runAction, addLuxOSPool, ip, newUrl, newUser, newPassword, loadPools]);

  const handleSwitchPool = useCallback(
    (poolId: number) => {
      void runAction(`pool:switch:${poolId}`, () =>
        switchLuxOSPool(ip, poolId)
      ).then((ok) => {
        if (ok) void loadPools();
      });
    },
    [runAction, switchLuxOSPool, ip, loadPools]
  );

  const handleRemovePool = useCallback(
    (pool: luxos.LuxOSPool) => {
      const poolId = pool.POOL;
      if (poolId === undefined) return;
      Alert.alert(
        t('miners.luxosRemovePool'),
        t('miners.luxosRemovePoolConfirm', {
          pool: pool.URL ?? pool['Stratum URL'] ?? `#${poolId}`,
        }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('miners.luxosRemovePool'),
            style: 'destructive',
            onPress: () => {
              void runAction(`pool:remove:${poolId}`, () =>
                removeLuxOSPool(ip, poolId)
              ).then((ok) => {
                if (ok) void loadPools();
              });
            },
          },
        ]
      );
    },
    [runAction, removeLuxOSPool, ip, loadPools, t]
  );

  const profiles = miner.luxosProfiles ?? [];
  const canAddPool =
    newUrl.trim().length > 0 && newUser.trim().length > 0 && busyAction === null;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" automaticOffset>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        {error && (
          <View className="mx-4 mt-4">
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          </View>
        )}

        {/* Power profile */}
        <View className="px-4 py-4">
          <SectionLabel>{t('miners.luxosProfile')}</SectionLabel>
          {profiles.length === 0 ? (
            <Text variant="caption" color="muted">
              {t('miners.luxosNoProfiles')}
            </Text>
          ) : (
            <View className="gap-2">
              {profiles.map((profile) => {
                const isCurrent = profile.name === miner.luxosProfile;
                const isBusy = busyAction === `profile:${profile.name}`;
                const detail = [
                  profile.hashrateThs !== undefined
                    ? `~${profile.hashrateThs} TH/s`
                    : null,
                  profile.watts !== undefined ? `${profile.watts} W` : null,
                  profile.frequency !== undefined
                    ? `${profile.frequency} MHz`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <Pressable
                    key={profile.name}
                    onPress={() => handleSelectProfile(profile.name)}
                    disabled={busyAction !== null || isCurrent}
                    className={`flex-row items-center justify-between py-3 px-4 ${
                      isCurrent
                        ? 'bg-foreground'
                        : 'bg-background border border-border'
                    } ${busyAction !== null && !isBusy ? 'opacity-50' : ''}`}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.7 : undefined,
                    })}
                  >
                    <View className="flex-1">
                      <Text
                        variant="mono"
                        className={`font-medium ${isCurrent ? 'text-gray-950' : ''}`}
                        style={{ fontSize: 14 }}
                      >
                        {profile.name}
                      </Text>
                      {detail.length > 0 && (
                        <Text
                          variant="caption"
                          className={isCurrent ? 'text-gray-950' : ''}
                          color={isCurrent ? undefined : 'muted'}
                        >
                          {detail}
                        </Text>
                      )}
                    </View>
                    {isBusy && (
                      <ActivityIndicator size="small" color={colors.text} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
          <Hint>{t('miners.luxosProfileHint')}</Hint>
          {miner.luxosAtmEnabled && <Hint>{t('miners.luxosProfileAtmNote')}</Hint>}
        </View>

        {/* Locate LED */}
        <View className="px-4 py-4 border-t border-border-light">
          <SectionLabel>{t('miners.luxosLocate')}</SectionLabel>
          <View className="flex-row gap-2">
            {([true, false] as const).map((on) => {
              const selected = locateOn === on;
              const isBusy = busyAction === `locate:${on}`;
              return (
                <Pressable
                  key={String(on)}
                  onPress={() => handleLocate(on)}
                  disabled={busyAction !== null || selected}
                  className={`flex-1 py-3 items-center ${
                    selected
                      ? 'bg-foreground'
                      : 'bg-background border border-border'
                  } ${busyAction !== null && !isBusy ? 'opacity-50' : ''}`}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.7 : undefined,
                  })}
                >
                  {isBusy ? (
                    <ActivityIndicator
                      size="small"
                      color={selected ? colors.background : colors.text}
                    />
                  ) : (
                    <Text
                      variant="mono"
                      className={`font-medium ${selected ? 'text-gray-950' : ''}`}
                      style={{ fontSize: 13 }}
                    >
                      {on ? t('common.on') : t('common.off')}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
          <Hint>{t('miners.luxosLocateHint')}</Hint>
        </View>

        {/* Pools */}
        <View className="px-4 py-4 border-t border-border-light">
          <SectionLabel>{t('miners.luxosPools')}</SectionLabel>

          {poolsLoading ? (
            <View className="items-center py-6">
              <ActivityIndicator size="small" color={colors.text} />
            </View>
          ) : poolsError ? (
            <Pressable
              onPress={() => void loadPools()}
              className="flex-row items-center justify-center gap-2 py-3 bg-background border border-border"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Ionicons name="refresh" size={16} color={colors.textMuted} />
              <Text variant="caption" color="muted">
                {t('miners.luxosPoolsLoadFailed')}
              </Text>
            </Pressable>
          ) : (
            <View className="gap-2">
              {(pools ?? []).map((pool, index) => {
                const poolId = pool.POOL ?? index;
                const active = pool['Stratum Active'] === true;
                const url = pool.URL ?? pool['Stratum URL'] ?? '--';
                return (
                  <View
                    key={poolId}
                    className="py-3 px-4 bg-background border border-border"
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1 mr-2">
                        <Text
                          variant="mono"
                          numberOfLines={1}
                          style={{ fontSize: 13 }}
                        >
                          {url}
                        </Text>
                        <Text variant="caption" color="muted" numberOfLines={1}>
                          {pool.User ?? '--'}
                          {pool.Status ? ` · ${pool.Status}` : ''}
                          {active ? ` · ${t('miners.active')}` : ''}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-3">
                        {!active && (
                          <Pressable
                            onPress={() => handleSwitchPool(poolId)}
                            disabled={busyAction !== null}
                            hitSlop={8}
                          >
                            {busyAction === `pool:switch:${poolId}` ? (
                              <ActivityIndicator
                                size="small"
                                color={colors.text}
                              />
                            ) : (
                              <Ionicons
                                name="arrow-up-circle-outline"
                                size={22}
                                color={colors.text}
                              />
                            )}
                          </Pressable>
                        )}
                        <Pressable
                          onPress={() => handleRemovePool(pool)}
                          disabled={busyAction !== null}
                          hitSlop={8}
                        >
                          {busyAction === `pool:remove:${poolId}` ? (
                            <ActivityIndicator
                              size="small"
                              color={colors.danger}
                            />
                          ) : (
                            <Ionicons
                              name="trash-outline"
                              size={20}
                              color={colors.danger}
                            />
                          )}
                        </Pressable>
                      </View>
                    </View>
                  </View>
                );
              })}

              {addOpen ? (
                <View className="py-3 px-4 bg-background border border-border gap-3">
                  <TextInput
                    value={newUrl}
                    onChangeText={setNewUrl}
                    placeholder="stratum+tcp://pool.example.com:3333"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={inputStyle}
                  />
                  <TextInput
                    value={newUser}
                    onChangeText={setNewUser}
                    placeholder={t('miners.workerPlaceholder')}
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={inputStyle}
                  />
                  <TextInput
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="x"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={inputStyle}
                  />
                  <View className="flex-row gap-2">
                    <Pressable
                      onPress={() => setAddOpen(false)}
                      disabled={busyAction !== null}
                      className="flex-1 py-3 items-center bg-background border border-border"
                      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                    >
                      <Text variant="body">{t('common.cancel')}</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleAddPool}
                      disabled={!canAddPool}
                      className={`flex-1 py-3 items-center bg-foreground ${
                        canAddPool ? '' : 'opacity-50'
                      }`}
                      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                    >
                      {busyAction === 'pool:add' ? (
                        <ActivityIndicator
                          size="small"
                          color={colors.background}
                        />
                      ) : (
                        <Text variant="body" className="font-medium text-gray-950">
                          {t('miners.luxosAddPool')}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  onPress={() => setAddOpen(true)}
                  disabled={busyAction !== null}
                  className="flex-row items-center justify-center gap-2 py-3 bg-background border border-border"
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                  <Ionicons name="add" size={18} color={colors.text} />
                  <Text variant="body">{t('miners.luxosAddPool')}</Text>
                </Pressable>
              )}
            </View>
          )}
          <Hint>{t('miners.luxosPoolsHint')}</Hint>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
