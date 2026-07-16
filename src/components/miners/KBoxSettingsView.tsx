/**
 * KBoxSettingsView - Settings body for GekkoScience KBox miners.
 *
 * Rendered by MinerSettingsScreen in place of the AxeOS form (same
 * pattern as AvalonSettingsView). Drives the KBox /api/v1/ control
 * endpoints via the store actions: power mode (Low/Medium/High or a
 * custom freq/corev overclock), fan (auto or a percent floor) and the
 * ambient LEDs (effect / colour / speed / brightness).
 *
 * All inputs are preset chips/segments — consistent with the app's
 * terminal aesthetic, and the API ranges quantize fine (freq 250-650,
 * corev 260-320, speed 10-1000, brightness 0-255).
 *
 * The LED effect catalogue is fetched from the device at mount
 * (GET /api/v1/led/effects, session-cached in the API layer) — the
 * docs forbid hard-coding it since firmware updates may add effects.
 * If that fetch fails, the LED section degrades to on/off+brightness
 * instead of blocking fan/power controls.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../Text';
import { KBoxAuthSheet } from './KBoxAuthSheet';
import { useMinerStore } from '@/store/minerStore';
import { kbox, isSuccess } from '@/api';
import { getKBoxApiKey } from '@/utils/kboxAuth';
import { haptics } from '@/utils/haptics';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';
import type { LocalMiner, ApiResult } from '@/types';

export interface KBoxSettingsViewProps {
  miner: LocalMiner;
}

const POWER_MODES = ['Low', 'Medium', 'High'] as const;

const FREQ_OPTIONS = [250, 300, 350, 400, 450, 500, 550, 600, 650];
const COREV_OPTIONS = [260, 270, 280, 290, 300, 310, 320];
const FAN_PERCENT_OPTIONS = [20, 40, 60, 80, 100];

// API speed: 10 (fast) – 1000 (slow)
const SPEED_OPTIONS = [
  { key: 'kboxLedSpeedFast', value: 50 },
  { key: 'kboxLedSpeedNormal', value: 250 },
  { key: 'kboxLedSpeedSlow', value: 600 },
] as const;

// Brightness 0-255 as quarter steps
const BRIGHTNESS_OPTIONS = [
  { label: '25%', value: 64 },
  { label: '50%', value: 128 },
  { label: '75%', value: 191 },
  { label: '100%', value: 255 },
] as const;

/** 12 swatches for effects that honour a custom {r,g,b} */
const COLOR_SWATCHES: { hex: string; r: number; g: number; b: number }[] = [
  { hex: '#FFFFFF', r: 255, g: 255, b: 255 },
  { hex: '#FF0000', r: 255, g: 0, b: 0 },
  { hex: '#FF5A00', r: 255, g: 90, b: 0 },
  { hex: '#FFB000', r: 255, g: 176, b: 0 },
  { hex: '#FFFF00', r: 255, g: 255, b: 0 },
  { hex: '#00FF00', r: 0, g: 255, b: 0 },
  { hex: '#00FFAA', r: 0, g: 255, b: 170 },
  { hex: '#00FFFF', r: 0, g: 255, b: 255 },
  { hex: '#0055FF', r: 0, g: 85, b: 255 },
  { hex: '#8000FF', r: 128, g: 0, b: 255 },
  { hex: '#FF00FF', r: 255, g: 0, b: 255 },
  { hex: '#FF7788', r: 255, g: 119, b: 136 },
];

/** Preferred group order for the effect picker; unknown groups follow */
const GROUP_ORDER = ['Basic', 'Motion', 'Colour', 'Ambient', 'Brand'];

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

/** Square segmented/chip button in the app's terminal style */
function Chip({
  label,
  selected,
  disabled,
  busy,
  onPress,
  flex,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  busy?: boolean;
  onPress: () => void;
  flex?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || selected}
      className={`py-3 items-center ${flex ? 'flex-1' : 'px-4'} ${
        selected ? 'bg-foreground' : 'bg-background border border-border'
      } ${disabled && !selected ? 'opacity-50' : ''}`}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : undefined })}
    >
      {busy ? (
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
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function KBoxSettingsView({ miner }: KBoxSettingsViewProps) {
  const { t } = useTranslation();
  const ip = miner.ip;

  const setKBoxPower = useMinerStore((s) => s.setKBoxPower);
  const setKBoxFan = useMinerStore((s) => s.setKBoxFan);
  const setKBoxLed = useMinerStore((s) => s.setKBoxLed);

  // One action in flight at a time; the string identifies which chip
  // shows the spinner (e.g. "power:Low", "fan:60", "led:effect:Wave").
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keySheetVisible, setKeySheetVisible] = useState(false);

  // --- Power ---
  const currentMode = miner.kboxPowerMode;
  const isPresetMode = POWER_MODES.some((m) => m === currentMode);
  const [customOpen, setCustomOpen] = useState(false);
  const [customFreq, setCustomFreq] = useState<number>(
    FREQ_OPTIONS.includes(miner.frequency) ? miner.frequency : 450
  );
  const [customCorev, setCustomCorev] = useState<number>(290);

  // --- Fan ---
  // /status has no authoritative auto/manual flag, so the segmented
  // control reflects write intent only: start on Auto (firmware default)
  // and highlight whatever the user last applied this session.
  const [fanMode, setFanMode] = useState<'auto' | 'manual'>('auto');
  const [fanPercent, setFanPercent] = useState<number | null>(null);

  // --- LED ---
  const led = miner.kboxLed;
  const [effects, setEffects] = useState<kbox.KBoxLedEffect[] | null>(null);
  const [effectsError, setEffectsError] = useState(false);
  const [effectsLoading, setEffectsLoading] = useState(true);

  const loadEffects = useCallback(
    async (force = false) => {
      setEffectsLoading(true);
      setEffectsError(false);
      const key = await getKBoxApiKey(ip);
      if (!key) {
        setEffectsError(true);
        setEffectsLoading(false);
        return;
      }
      const result = await kbox.getLedEffects(ip, key, { force });
      if (isSuccess(result) && result.data.length > 0) {
        setEffects(result.data);
      } else {
        setEffectsError(true);
      }
      setEffectsLoading(false);
    },
    [ip]
  );

  useEffect(() => {
    void loadEffects();
  }, [loadEffects]);

  // Group effects for the picker, preserving the documented group order
  const effectGroups = useMemo(() => {
    if (!effects) return [];
    const byGroup = new Map<string, kbox.KBoxLedEffect[]>();
    for (const effect of effects) {
      const group = effect.group ?? 'Other';
      const list = byGroup.get(group) ?? [];
      list.push(effect);
      byGroup.set(group, list);
    }
    return [...byGroup.entries()].sort(([a], [b]) => {
      const ia = GROUP_ORDER.indexOf(a);
      const ib = GROUP_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [effects]);

  const selectedEffect = useMemo(
    () =>
      effects?.find(
        (e) => e.name.toLowerCase() === led?.effect?.toLowerCase()
      ),
    [effects, led?.effect]
  );

  /**
   * Run a store write with the shared busy/error/auth handling. Every
   * control funnels through here. Returns {ok, code} so callers can
   * react to specific firmware error codes.
   */
  const runAction = useCallback(
    async (
      actionId: string,
      action: () => Promise<ApiResult<void>>
    ): Promise<{ ok: boolean; code?: string }> => {
      if (busyAction) return { ok: false };
      setBusyAction(actionId);
      setError(null);
      haptics.light();
      const result = await action();
      setBusyAction(null);
      if (result.success) {
        haptics.success();
        return { ok: true };
      }
      haptics.error();
      const code = result.error.code;
      if (code === 'unauthorized' || code === 'api_disabled') {
        // Key rejected mid-session (regenerated on the device?) — offer
        // re-entry. User-initiated context, so opening the sheet is OK.
        setError(
          code === 'api_disabled'
            ? t('errors.kboxApiDisabled')
            : t('errors.kboxUnauthorized')
        );
        setKeySheetVisible(true);
      } else {
        setError(result.error.message || t('errors.failedToApply'));
      }
      return { ok: false, code };
    },
    [busyAction, t]
  );

  const handlePowerMode = useCallback(
    (mode: (typeof POWER_MODES)[number]) => {
      setCustomOpen(false);
      void runAction(`power:${mode}`, () => setKBoxPower(ip, { mode }));
    },
    [runAction, setKBoxPower, ip]
  );

  const handleApplyCustomPower = useCallback(() => {
    void runAction('power:custom', () =>
      setKBoxPower(ip, { freq: customFreq, corev: customCorev })
    );
  }, [runAction, setKBoxPower, ip, customFreq, customCorev]);

  const handleFanAuto = useCallback(() => {
    void runAction('fan:auto', () => setKBoxFan(ip, { mode: 'auto' })).then(
      ({ ok }) => {
        if (ok) {
          setFanMode('auto');
          setFanPercent(null);
        }
      }
    );
  }, [runAction, setKBoxFan, ip]);

  const handleFanPercent = useCallback(
    (percent: number) => {
      void runAction(`fan:${percent}`, () =>
        setKBoxFan(ip, { percent })
      ).then(({ ok }) => {
        if (ok) {
          setFanMode('manual');
          setFanPercent(percent);
        }
      });
    },
    [runAction, setKBoxFan, ip]
  );

  const handleLedToggle = useCallback(
    (on: boolean) => {
      void runAction(`led:on:${on}`, () => setKBoxLed(ip, { on }));
    },
    [runAction, setKBoxLed, ip]
  );

  const handleLedEffect = useCallback(
    (name: string) => {
      void runAction(`led:effect:${name}`, () =>
        setKBoxLed(ip, { effect: name })
      ).then(async ({ ok, code }) => {
        if (!ok && code === 'unknown_effect') {
          // Our cached catalogue is stale (e.g. firmware updated) —
          // refetch it. The device's 400 lists the valid effects.
          setError(t('errors.kboxInvalidEffect'));
          await loadEffects(true);
        }
      });
    },
    [runAction, setKBoxLed, ip, loadEffects, t]
  );

  const handleLedColor = useCallback(
    (swatch: (typeof COLOR_SWATCHES)[number]) => {
      void runAction(`led:color:${swatch.hex}`, () =>
        setKBoxLed(ip, { color: { r: swatch.r, g: swatch.g, b: swatch.b } })
      );
    },
    [runAction, setKBoxLed, ip]
  );

  const handleLedSpeed = useCallback(
    (speed: number) => {
      void runAction(`led:speed:${speed}`, () => setKBoxLed(ip, { speed }));
    },
    [runAction, setKBoxLed, ip]
  );

  const handleLedBrightness = useCallback(
    (brightness: number) => {
      void runAction(`led:brightness:${brightness}`, () =>
        setKBoxLed(ip, { brightness })
      );
    },
    [runAction, setKBoxLed, ip]
  );

  const ledOn = led?.on === true;
  // Nearest speed/brightness chip gets the highlight (device may report
  // values between our presets)
  const ledSpeed = led?.speed;
  const nearestSpeed =
    ledSpeed !== undefined
      ? SPEED_OPTIONS.reduce((best, o) =>
          Math.abs(o.value - ledSpeed) < Math.abs(best.value - ledSpeed)
            ? o
            : best
        ).value
      : null;
  const ledBrightness = led?.brightness;
  const nearestBrightness =
    ledBrightness !== undefined
      ? BRIGHTNESS_OPTIONS.reduce((best, o) =>
          Math.abs(o.value - ledBrightness) <
          Math.abs(best.value - ledBrightness)
            ? o
            : best
        ).value
      : null;

  const ledColor = led?.color;
  const selectedSwatchHex = useMemo(() => {
    if (!ledColor) return null;
    const match = COLOR_SWATCHES.find(
      (s) => s.r === ledColor.r && s.g === ledColor.g && s.b === ledColor.b
    );
    return match?.hex ?? null;
  }, [ledColor]);

  return (
    <>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Error banner */}
        {error && (
          <View className="mx-4 mt-4 flex-row items-center justify-between py-3 px-4 bg-danger/10 border border-danger/30">
            <View className="flex-row items-center gap-2 flex-1">
              <Ionicons name="alert-circle" size={20} color={colors.danger} />
              <Text variant="body" color="danger" className="flex-1">
                {error}
              </Text>
            </View>
            <Pressable onPress={() => setError(null)} hitSlop={8}>
              <Ionicons name="close" size={20} color={colors.danger} />
            </Pressable>
          </View>
        )}

        {/* Power mode */}
        <View className="px-4 py-4">
          <SectionLabel>{t('miners.kboxPowerMode')}</SectionLabel>
          <View className="flex-row gap-2">
            {POWER_MODES.map((mode) => (
              <Chip
                key={mode}
                label={mode}
                flex
                selected={!customOpen && currentMode === mode}
                busy={busyAction === `power:${mode}`}
                disabled={busyAction !== null}
                onPress={() => handlePowerMode(mode)}
              />
            ))}
            <Chip
              label={t('miners.kboxPowerCustom')}
              flex
              selected={customOpen || (!isPresetMode && !!currentMode)}
              disabled={busyAction !== null}
              onPress={() => setCustomOpen((v) => !v)}
            />
          </View>

          {customOpen && (
            <View className="mt-4">
              <Text variant="body" className="mb-2">
                {t('miners.kboxCustomFreq')}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row gap-2">
                  {FREQ_OPTIONS.map((f) => (
                    <Chip
                      key={f}
                      label={`${f}`}
                      selected={customFreq === f}
                      disabled={busyAction !== null}
                      onPress={() => setCustomFreq(f)}
                    />
                  ))}
                </View>
              </ScrollView>

              <Text variant="body" className="mb-2 mt-4">
                {t('miners.kboxCustomCorev')}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row gap-2">
                  {COREV_OPTIONS.map((v) => (
                    <Chip
                      key={v}
                      label={`${v}`}
                      selected={customCorev === v}
                      disabled={busyAction !== null}
                      onPress={() => setCustomCorev(v)}
                    />
                  ))}
                </View>
              </ScrollView>

              <Pressable
                onPress={handleApplyCustomPower}
                disabled={busyAction !== null}
                className="mt-4 py-3 bg-foreground items-center"
                style={({ pressed }) => ({
                  opacity: pressed || busyAction !== null ? 0.6 : 1,
                })}
              >
                {busyAction === 'power:custom' ? (
                  <ActivityIndicator size="small" color={colors.background} />
                ) : (
                  <Text variant="body" className="font-medium text-gray-950">
                    {t('common.apply')}
                  </Text>
                )}
              </Pressable>
            </View>
          )}
          <Hint>{t('miners.kboxPowerRevertHint')}</Hint>
        </View>

        {/* Fan */}
        <View className="px-4 py-4 border-t border-border-light">
          <SectionLabel>{t('miners.fanSpeed')}</SectionLabel>
          <View className="flex-row gap-2">
            <Chip
              label={t('miners.auto')}
              flex
              selected={fanMode === 'auto'}
              busy={busyAction === 'fan:auto'}
              disabled={busyAction !== null}
              onPress={handleFanAuto}
            />
            <Chip
              label={t('common.manual')}
              flex
              selected={fanMode === 'manual'}
              disabled={busyAction !== null}
              onPress={() => setFanMode('manual')}
            />
          </View>
          {fanMode === 'manual' && (
            <View className="flex-row gap-2 mt-3">
              {FAN_PERCENT_OPTIONS.map((p) => (
                <Chip
                  key={p}
                  label={`${p}%`}
                  flex
                  selected={fanPercent === p}
                  busy={busyAction === `fan:${p}`}
                  disabled={busyAction !== null}
                  onPress={() => handleFanPercent(p)}
                />
              ))}
            </View>
          )}
          <Hint>{t('miners.kboxFanFloorHint')}</Hint>
        </View>

        {/* LED */}
        <View className="px-4 py-4 border-t border-border-light">
          <SectionLabel>{t('miners.kboxLed')}</SectionLabel>

          {/* On / Off */}
          <View className="flex-row gap-2">
            <Chip
              label={t('miners.kboxLedOn')}
              flex
              selected={ledOn}
              busy={busyAction === 'led:on:true'}
              disabled={busyAction !== null}
              onPress={() => handleLedToggle(true)}
            />
            <Chip
              label={t('miners.kboxLedOff')}
              flex
              selected={led !== undefined && !ledOn}
              busy={busyAction === 'led:on:false'}
              disabled={busyAction !== null}
              onPress={() => handleLedToggle(false)}
            />
          </View>

          {/* Effect picker (grouped). Degrades to on/off + brightness on
              catalogue fetch failure. */}
          {effectsLoading ? (
            <View className="items-center py-6">
              <ActivityIndicator size="small" color={colors.text} />
            </View>
          ) : effectsError ? (
            <Pressable
              onPress={() => void loadEffects(true)}
              className="mt-3 flex-row items-center justify-center gap-2 py-3 bg-background border border-border"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Ionicons name="refresh" size={16} color={colors.textMuted} />
              <Text variant="caption" color="muted">
                {t('errors.kboxEffectsLoadFailed')}
              </Text>
            </Pressable>
          ) : (
            effectGroups.map(([group, groupEffects]) => (
              <View key={group} className="mt-4">
                <Text
                  variant="mono"
                  className="uppercase mb-2"
                  style={{
                    fontSize: 10,
                    letterSpacing: 0.6,
                    color: colors.textDim,
                  }}
                >
                  {group}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {groupEffects.map((effect) => (
                    <Chip
                      key={effect.name}
                      label={effect.label ?? effect.name}
                      selected={
                        led?.effect?.toLowerCase() === effect.name.toLowerCase()
                      }
                      busy={busyAction === `led:effect:${effect.name}`}
                      disabled={busyAction !== null}
                      onPress={() => handleLedEffect(effect.name)}
                    />
                  ))}
                </View>
              </View>
            ))
          )}

          {/* Colour swatches — only for effects that honour {r,g,b} */}
          {selectedEffect?.color === true && (
            <View className="mt-4">
              <Text variant="body" className="mb-2">
                {t('miners.kboxLedColor')}
              </Text>
              <View className="flex-row flex-wrap" style={{ gap: 10 }}>
                {COLOR_SWATCHES.map((swatch) => {
                  const isSelected = selectedSwatchHex === swatch.hex;
                  return (
                    <Pressable
                      key={swatch.hex}
                      onPress={() => handleLedColor(swatch)}
                      disabled={busyAction !== null}
                      style={({ pressed }) => ({
                        width: 40,
                        height: 40,
                        backgroundColor: swatch.hex,
                        borderWidth: isSelected ? 2 : 1,
                        borderColor: isSelected
                          ? colors.text
                          : colors.borderLight,
                        opacity:
                          pressed || busyAction === `led:color:${swatch.hex}`
                            ? 0.6
                            : 1,
                      })}
                    />
                  );
                })}
              </View>
            </View>
          )}

          {/* Speed */}
          {!effectsError && !effectsLoading && (
            <View className="mt-4">
              <Text variant="body" className="mb-2">
                {t('miners.kboxLedSpeed')}
              </Text>
              <View className="flex-row gap-2">
                {SPEED_OPTIONS.map((o) => (
                  <Chip
                    key={o.key}
                    label={t(`miners.${o.key}`)}
                    flex
                    selected={nearestSpeed === o.value}
                    busy={busyAction === `led:speed:${o.value}`}
                    disabled={busyAction !== null}
                    onPress={() => handleLedSpeed(o.value)}
                  />
                ))}
              </View>
            </View>
          )}

          {/* Brightness */}
          <View className="mt-4">
            <Text variant="body" className="mb-2">
              {t('miners.kboxLedBrightness')}
            </Text>
            <View className="flex-row gap-2">
              {BRIGHTNESS_OPTIONS.map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  flex
                  selected={nearestBrightness === o.value}
                  busy={busyAction === `led:brightness:${o.value}`}
                  disabled={busyAction !== null}
                  onPress={() => handleLedBrightness(o.value)}
                />
              ))}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Re-auth when a write comes back unauthorized */}
      <KBoxAuthSheet
        visible={keySheetVisible}
        ip={ip}
        onSuccess={() => {
          setError(null);
          void useMinerStore.getState().refreshMiner(ip);
          void loadEffects(true);
        }}
        onClose={() => setKeySheetVisible(false)}
      />
    </>
  );
}
