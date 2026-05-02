/**
 * AvalonSettingsView - pool config screen for Avalon miners.
 *
 * Avalon's writable surface from this app is intentionally narrow:
 * pool slots only. (Work mode lives on the detail screen as inline
 * controls; reboot is handled there too.) The cgminer interface
 * doesn't accept `setpool`, so saves go through the web CGI which
 * requires the device admin password.
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Text } from '@/components/Text';
import { ErrorBanner } from '@/components/ErrorBanner';
import { SwipeToConfirm } from '@/components/SwipeToConfirm';
import { AvalonAuthSheet } from './AvalonAuthSheet';
import { useMinerStore } from '@/store/minerStore';
import { isValidStratumUrl } from '@/utils/validation';
import { getAvalonPassword } from '@/utils/avalonAuth';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';
import { haptics } from '@/utils/haptics';
import type { LocalMiner } from '@/types';
import type { PoolSlot } from '@/api/avalonWeb';

const WORKER_NAME_MAX = 128;

interface SlotState {
  url: string;
  worker: string;
  password: string;
}

const EMPTY_SLOT: SlotState = { url: '', worker: '', password: '' };

export interface AvalonSettingsViewProps {
  miner: LocalMiner;
  onSaved?: () => void;
}

export function AvalonSettingsView({ miner, onSaved }: AvalonSettingsViewProps) {
  const { t } = useTranslation();
  const setAvalonPools = useMinerStore((s) => s.setAvalonPools);
  const restartMiner = useMinerStore((s) => s.restartMiner);

  // Hydrate slot 1 from the live miner record. Slots 2 and 3 aren't
  // surfaced in `LocalMiner` yet — left blank; the user can fill them.
  const [slots, setSlots] = useState<[SlotState, SlotState, SlotState]>(() => [
    {
      url: miner.stratumUrl
        ? `stratum+tcp://${miner.stratumUrl}:${miner.stratumPort}`
        : '',
      worker: miner.stratumUser ?? '',
      password: '',
    },
    EMPTY_SLOT,
    EMPTY_SLOT,
  ]);

  const [authSheetVisible, setAuthSheetVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasStoredPassword, setHasStoredPassword] = useState(false);

  // Track whether we have a saved admin password — drives whether the
  // save button kicks off the auth sheet or goes straight through.
  useEffect(() => {
    void (async () => {
      const stored = await getAvalonPassword(miner.macAddress ?? miner.ip);
      setHasStoredPassword(!!stored);
    })();
  }, [miner.macAddress, miner.ip]);

  const slot1Errors = useMemo(() => {
    const errs: string[] = [];
    const s = slots[0];
    if (!s.url.trim()) errs.push(t('miners.urlRequired'));
    else if (!isValidStratumUrl(s.url.trim())) {
      errs.push(t('miners.invalidStratumUrl'));
    }
    if (s.worker.length > WORKER_NAME_MAX) {
      errs.push(t('miners.workerTooLong', { max: WORKER_NAME_MAX }));
    }
    return errs;
  }, [slots, t]);

  const canSave = slot1Errors.length === 0 && !saving;

  const updateSlot = useCallback(
    (index: 0 | 1 | 2, patch: Partial<SlotState>) => {
      setSlots((prev) => {
        const next = [...prev] as [SlotState, SlotState, SlotState];
        next[index] = { ...next[index], ...patch };
        return next;
      });
    },
    []
  );

  const performSave = useCallback(
    async (password: string) => {
      setSaving(true);
      setError(null);

      // Build the slot tuple, dropping empty trailing slots.
      const submit = (s: SlotState): PoolSlot => ({
        url: s.url.trim(),
        worker: s.worker.trim(),
        password: s.password,
      });
      const slotsToSend: [PoolSlot, PoolSlot?, PoolSlot?] = [
        submit(slots[0]),
        slots[1].url.trim() ? submit(slots[1]) : undefined,
        slots[2].url.trim() ? submit(slots[2]) : undefined,
      ];

      const ok = await setAvalonPools(miner.ip, password, slotsToSend);
      if (!ok) {
        setSaving(false);
        haptics.error();
        setError(t('errors.failedToSavePools'));
        return;
      }

      // Pool changes only take effect after a reboot.
      const restartOk = await restartMiner(miner.ip);
      setSaving(false);
      if (restartOk) {
        haptics.success();
        onSaved?.();
      } else {
        setError(t('errors.failedToRestart'));
      }
    },
    [slots, miner.ip, setAvalonPools, restartMiner, onSaved, t]
  );

  const handleSwipeSave = useCallback(async () => {
    if (!hasStoredPassword) {
      setAuthSheetVisible(true);
      return;
    }
    const stored = await getAvalonPassword(miner.macAddress ?? miner.ip);
    if (!stored) {
      setAuthSheetVisible(true);
      return;
    }
    await performSave(stored);
  }, [hasStoredPassword, miner.macAddress, miner.ip, performSave]);

  const handleAuthSubmit = useCallback(
    async (password: string) => {
      setAuthSheetVisible(false);
      setHasStoredPassword(true);
      await performSave(password);
    },
    [performSave]
  );

  const renderSlot = (index: 0 | 1 | 2) => {
    const s = slots[index];
    return (
      <View
        key={index}
        className="bg-secondary rounded-lg p-4 mb-3 gap-3"
      >
        <Text variant="caption" color="muted" className="uppercase">
          {t('miners.avalonPoolSlot', { n: index + 1 })}
          {index > 0 ? ` (${t('common.optional').toLowerCase()})` : ''}
        </Text>
        <TextInput
          value={s.url}
          onChangeText={(v) => updateSlot(index, { url: v })}
          placeholder="stratum+tcp://pool.example.com:3333"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: colors.text,
            fontSize: 15,
            backgroundColor: colors.background,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        />
        <TextInput
          value={s.worker}
          onChangeText={(v) => updateSlot(index, { worker: v })}
          placeholder={t('miners.workerPlaceholder')}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={WORKER_NAME_MAX}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: colors.text,
            fontSize: 15,
            backgroundColor: colors.background,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        />
        <TextInput
          value={s.password}
          onChangeText={(v) => updateSlot(index, { password: v })}
          placeholder="x"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: colors.text,
            fontSize: 15,
            backgroundColor: colors.background,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        />
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      >
        <Text variant="caption" color="muted" className="mb-2 uppercase">
          {t('miners.avalonPoolConfig')}
        </Text>
        <Text variant="caption" color="muted" className="mb-4">
          {t('miners.avalonPoolConfigHint')}
        </Text>

        {renderSlot(0)}
        {renderSlot(1)}
        {renderSlot(2)}

        {slot1Errors.length > 0 && (
          <View className="mb-3">
            {slot1Errors.map((err) => (
              <Text key={err} variant="caption" color="danger">
                • {err}
              </Text>
            ))}
          </View>
        )}

        {error && (
          <View className="mb-3">
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          </View>
        )}

        {saving ? (
          <View className="flex-row items-center justify-center gap-3 py-4 bg-secondary rounded-lg">
            <ActivityIndicator size="small" color={colors.text} />
            <Text variant="body" color="muted">
              {t('miners.applyingSettings')}
            </Text>
          </View>
        ) : (
          <SwipeToConfirm
            label={t('miners.swipeToSavePools')}
            confirmLabel={t('miners.applyingSettings')}
            onConfirm={handleSwipeSave}
            variant="danger"
            disabled={!canSave}
          />
        )}
      </ScrollView>

      <AvalonAuthSheet
        visible={authSheetVisible}
        macOrIp={miner.macAddress ?? miner.ip}
        onSubmit={handleAuthSubmit}
        onClose={() => setAuthSheetVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}
