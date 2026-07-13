/**
 * SettingsMainScreen - User preferences and Bitcoin address management.
 *
 * "Monochrome / framed" direction: a scrolling column of square hairline cards
 * (SettingsCard), each with a monospace uppercase header. Preferences use the
 * shared square segmented control (OptionToggleGroup); the widget/notification
 * booleans use the square Switch. Matches the Settings handoff spec.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { View, ScrollView, Pressable, TextInput, Linking, AppState } from 'react-native';
import {
  LanguageSelectorSheet,
  OptionToggleGroup,
  SettingsCard,
} from '@/components/settings';
import { Switch } from '@/components/Switch';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import Constants from 'expo-constants';
import { Text } from '@/components/Text';
import {
  useSettingsStore,
  selectBitcoinAddress,
  selectTemperatureUnit,
  selectPollingInterval,
  selectWorkerSortOrder,
  selectLanguage,
  selectNotificationsEnabled,
  selectNotificationPrefs,
  selectWidgetUpdatesEnabled,
  type PollingInterval,
  type WorkerSortOrder,
  type NotificationPrefs,
} from '@/store/settingsStore';
import {
  requestPermissions,
  getPermissionStatus,
  openNotificationSettings,
  canReceivePushNotifications,
  type PermissionStatus,
} from '@/utils/notifications';
import { useTranslation } from '@/i18n';
import { isValidBitcoinAddress, isTaprootAddress } from '@/utils/validation';
import { normalizeBitcoinAddress } from '@/utils/bitcoinAddress';
import { haptics } from '@/utils/haptics';
import { colors } from '@/constants/colors';
import type { SettingsStackScreenProps } from '@/types/navigation';

type Props = SettingsStackScreenProps<'SettingsMain'>;

/** Polling interval options */
const POLLING_OPTIONS: { value: PollingInterval; label: string }[] = [
  { value: 5000, label: '5s' },
  { value: 10000, label: '10s' },
  { value: 20000, label: '20s' },
  { value: 30000, label: '30s' },
];

/** Temperature unit options */
const TEMP_OPTIONS = [
  { value: 'celsius' as const, label: 'C' },
  { value: 'fahrenheit' as const, label: 'F' },
];

/** Worker sort order options */
const SORT_OPTIONS: { value: WorkerSortOrder; label: string }[] = [
  { value: 'hashrate', label: 'Hashrate' },
  { value: 'name', label: 'Name' },
  { value: 'bestDiff', label: 'Best Diff' },
];

/** External links */
const LINKS = {
  parasite: 'https://parasite.space',
};

// Row label = near-white (#f4f4f5); values/desc use the muted/dim ramp.
const LABEL_COLOR = colors.primary;
const ROW_H_PAD = 14;

export function SettingsMainScreen({ navigation }: Props) {
  const { t } = useTranslation();

  // Store
  const bitcoinAddress = useSettingsStore(selectBitcoinAddress);
  const temperatureUnit = useSettingsStore(selectTemperatureUnit);
  const pollingInterval = useSettingsStore(selectPollingInterval);
  const workerSortOrder = useSettingsStore(selectWorkerSortOrder);
  const language = useSettingsStore(selectLanguage);
  const notificationsEnabled = useSettingsStore(selectNotificationsEnabled);
  const notificationPrefs = useSettingsStore(selectNotificationPrefs);
  const widgetUpdatesEnabled = useSettingsStore(selectWidgetUpdatesEnabled);

  // Actions
  const setBitcoinAddress = useSettingsStore((s) => s.setBitcoinAddress);
  const setTemperatureUnit = useSettingsStore((s) => s.setTemperatureUnit);
  const setPollingInterval = useSettingsStore((s) => s.setPollingInterval);
  const setWorkerSortOrder = useSettingsStore((s) => s.setWorkerSortOrder);
  const setNotificationsEnabled = useSettingsStore((s) => s.setNotificationsEnabled);
  const setNotificationPrefs = useSettingsStore((s) => s.setNotificationPrefs);
  const setWidgetUpdatesEnabled = useSettingsStore((s) => s.setWidgetUpdatesEnabled);

  // Local state
  const [addressInput, setAddressInput] = useState(bitcoinAddress || '');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isAddressValid, setIsAddressValid] = useState<boolean | null>(null);
  const [showLanguageSheet, setShowLanguageSheet] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('undetermined');

  // Get current language display name
  const languageDisplayName = useMemo(() => {
    return t(`settings.languageNames.${language}`);
  }, [language, t]);

  // Show a warning when the saved address is taproot (common Xverse footgun).
  const showTaprootWarning = useMemo(
    () => isAddressValid === true && !!bitcoinAddress && isTaprootAddress(bitcoinAddress),
    [isAddressValid, bitcoinAddress]
  );

  // Address is "valid" for the header chip only when saved + confirmed valid.
  const showValidTag = isAddressValid === true && !!bitcoinAddress;

  // Sync input with store
  useEffect(() => {
    if (bitcoinAddress !== null) {
      setAddressInput(bitcoinAddress);
      setIsAddressValid(true);
    }
  }, [bitcoinAddress]);

  // Check notification permission status on mount
  useEffect(() => {
    getPermissionStatus().then(setPermissionStatus);
  }, []);

  // Refresh permission status when app returns to foreground
  // (user may have changed permissions in system settings)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        getPermissionStatus().then(setPermissionStatus);
      }
    });

    return () => subscription.remove();
  }, []);

  // App version from expo-constants
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  // Handlers
  const handleAddressChange = useCallback((text: string) => {
    setAddressInput(text);
    setValidationError(null);
    setIsAddressValid(null);
  }, []);

  const handleAddressSubmit = useCallback(() => {
    const trimmed = addressInput.trim();

    if (!trimmed) {
      // Clear address
      setBitcoinAddress(null);
      setIsAddressValid(null);
      setValidationError(null);
      return;
    }

    if (isValidBitcoinAddress(trimmed)) {
      const normalized = normalizeBitcoinAddress(trimmed);
      haptics.success();
      setAddressInput(normalized);
      setBitcoinAddress(normalized);
      setIsAddressValid(true);
      setValidationError(null);
    } else {
      haptics.error();
      setIsAddressValid(false);
      setValidationError(t('settings.invalidAddress'));
    }
  }, [addressInput, setBitcoinAddress, t]);

  const handleScanQR = useCallback(() => {
    haptics.light();
    navigation.navigate('QRScanner');
  }, [navigation]);

  const handleOpenLanguageSheet = useCallback(() => {
    haptics.light();
    setShowLanguageSheet(true);
  }, []);

  const handleOpenLink = useCallback((url: string) => {
    haptics.light();
    Linking.openURL(url);
  }, []);

  const handleToggleNotifications = useCallback(async () => {
    haptics.selection();

    if (!notificationsEnabled) {
      // Enabling - request permissions if needed
      const status = await requestPermissions();
      setPermissionStatus(status);

      if (status === 'granted') {
        setNotificationsEnabled(true);
      }
      // If denied, don't enable - user needs to go to settings
    } else {
      // Disabling
      setNotificationsEnabled(false);
    }
  }, [notificationsEnabled, setNotificationsEnabled]);

  const handleToggleNotificationPref = useCallback(
    (key: keyof NotificationPrefs) => {
      haptics.selection();
      setNotificationPrefs({ [key]: !notificationPrefs[key] });
    },
    [notificationPrefs, setNotificationPrefs]
  );

  const handleToggleWidgetUpdates = useCallback(async () => {
    haptics.selection();

    if (!widgetUpdatesEnabled && canReceivePushNotifications()) {
      const status = await requestPermissions();
      setPermissionStatus(status);
      // Keep the setting enabled even when permission is denied; background
      // refresh can still update widgets, but silent pushes will be unavailable.
    }

    setWidgetUpdatesEnabled(!widgetUpdatesEnabled);
  }, [setWidgetUpdatesEnabled, widgetUpdatesEnabled]);

  const handleOpenNotificationSettings = useCallback(() => {
    haptics.light();
    openNotificationSettings();
  }, []);

  const handleOpenBlockedUsers = useCallback(() => {
    haptics.light();
    navigation.navigate('BlockedUsers');
  }, [navigation]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Screen title */}
        <Text
          variant="title"
          className="font-bold"
          style={{ fontSize: 30, lineHeight: 36, color: LABEL_COLOR, marginTop: 12, marginBottom: 16 }}
        >
          {t('settings.title')}
        </Text>

        <View style={{ gap: 16 }}>
          {/* ── Bitcoin Address ───────────────────────────── */}
          <SettingsCard
            header={t('settings.bitcoinAddress')}
            headerRight={
              showValidTag ? (
                <View
                  style={{
                    backgroundColor: colors.textSecondary,
                    paddingHorizontal: 7,
                    paddingVertical: 2,
                  }}
                >
                  <Text
                    variant="mono"
                    style={{ fontSize: 10, letterSpacing: 0.6, color: '#0c0c0d' }}
                  >
                    {t('settings.valid')}
                  </Text>
                </View>
              ) : undefined
            }
          >
            <View style={{ paddingHorizontal: ROW_H_PAD, paddingVertical: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <TextInput
                  value={addressInput}
                  onChangeText={handleAddressChange}
                  onBlur={handleAddressSubmit}
                  onSubmitEditing={handleAddressSubmit}
                  style={{
                    flex: 1,
                    fontFamily: 'JetBrainsMono_400Regular',
                    fontSize: 14,
                    color: colors.textValue,
                    padding: 0,
                  }}
                  placeholderTextColor={colors.textDim}
                  placeholder={t('settings.addressPlaceholder')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                />
                <Pressable
                  onPress={handleScanQR}
                  hitSlop={6}
                  accessibilityLabel={t('settings.scanQr')}
                  className="items-center justify-center active:opacity-70"
                  style={{
                    width: 38,
                    height: 38,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.14)',
                    backgroundColor: colors.background,
                  }}
                >
                  <Ionicons name="qr-code-outline" size={20} color={colors.textValue} />
                </Pressable>
              </View>

              {/* Validation error */}
              {validationError && (
                <Animated.View
                  entering={FadeIn.duration(200)}
                  exiting={FadeOut.duration(200)}
                  className="flex-row items-center"
                  style={{ marginTop: 10 }}
                >
                  <Ionicons name="alert-circle" size={16} color={colors.danger} />
                  <Text variant="caption" color="danger" className="ml-1">
                    {validationError}
                  </Text>
                </Animated.View>
              )}

              {/* Taproot / Xverse warning */}
              {showTaprootWarning && (
                <Animated.View
                  entering={FadeIn.duration(200)}
                  exiting={FadeOut.duration(200)}
                  className="flex-row"
                  style={{ marginTop: 10 }}
                >
                  <Ionicons
                    name="warning-outline"
                    size={16}
                    color={colors.warning}
                    style={{ marginTop: 2 }}
                  />
                  <Text variant="caption" color="warning" className="ml-1 flex-1">
                    {t('settings.taprootWarning')}
                  </Text>
                </Animated.View>
              )}
            </View>
          </SettingsCard>

          {/* ── Preferences ───────────────────────────────── */}
          <SettingsCard header={t('settings.preferences')}>
            {/* Language */}
            <Pressable
              onPress={handleOpenLanguageSheet}
              className="flex-row items-center justify-between active:opacity-70"
              style={{ paddingHorizontal: ROW_H_PAD, paddingVertical: 14 }}
            >
              <Text variant="body" style={{ fontSize: 16, color: LABEL_COLOR }}>
                {t('settings.language')}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text variant="body" style={{ fontSize: 15, color: colors.textMuted }}>
                  {languageDisplayName}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
              </View>
            </Pressable>

            {/* Temperature */}
            <View style={{ paddingHorizontal: ROW_H_PAD, paddingVertical: 12 }}>
              <OptionToggleGroup
                options={TEMP_OPTIONS}
                selected={temperatureUnit}
                onSelect={setTemperatureUnit}
                label={t('settings.temperature')}
                layout="inline"
                font="mono"
              />
            </View>

            {/* Polling Interval */}
            <View style={{ paddingHorizontal: ROW_H_PAD, paddingVertical: 12 }}>
              <OptionToggleGroup
                options={POLLING_OPTIONS}
                selected={pollingInterval}
                onSelect={setPollingInterval}
                label={t('settings.pollingInterval')}
                layout="stacked"
                font="mono"
              />
            </View>

            {/* Worker Sort */}
            <View style={{ paddingHorizontal: ROW_H_PAD, paddingVertical: 12 }}>
              <OptionToggleGroup
                options={SORT_OPTIONS}
                selected={workerSortOrder}
                onSelect={setWorkerSortOrder}
                label={t('settings.workerSort')}
                layout="stacked"
                font="grotesk"
              />
            </View>
          </SettingsCard>

          {/* ── Chat ──────────────────────────────────────── */}
          <SettingsCard header={t('settings.chat')}>
            <Pressable
              onPress={handleOpenBlockedUsers}
              className="flex-row items-center justify-between active:opacity-70"
              style={{ paddingHorizontal: ROW_H_PAD, paddingVertical: 14 }}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text variant="body" style={{ fontSize: 16, color: LABEL_COLOR }}>
                  {t('settings.blockedUsers')}
                </Text>
                <Text
                  variant="mono"
                  style={{ fontSize: 11, lineHeight: 17, color: colors.textDim, marginTop: 5 }}
                >
                  {t('settings.blockedUsersSettingsHint')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
            </Pressable>
          </SettingsCard>

          {/* ── Notifications (kept, restyled) ─────────────── */}
          {canReceivePushNotifications() && (
            <SettingsCard header={t('settings.notifications')}>
              {/* Permission denied banner */}
              {permissionStatus === 'denied' && (
                <View style={{ paddingHorizontal: ROW_H_PAD, paddingVertical: 12 }}>
                  <Text variant="caption" color="muted" className="mb-2">
                    {t('settings.notificationsDenied')}
                  </Text>
                  <Pressable
                    onPress={handleOpenNotificationSettings}
                    className="flex-row items-center active:opacity-70"
                  >
                    <Text variant="body" style={{ color: LABEL_COLOR }}>
                      {t('settings.openSettings')}
                    </Text>
                    <Ionicons
                      name="open-outline"
                      size={16}
                      color={colors.primary}
                      style={{ marginLeft: 4 }}
                    />
                  </Pressable>
                </View>
              )}

              {/* Master toggle */}
              <SettingRow label={t('settings.enableNotifications')} disabled={permissionStatus === 'denied'}>
                <Switch
                  value={notificationsEnabled}
                  onValueChange={() => handleToggleNotifications()}
                  disabled={permissionStatus === 'denied'}
                />
              </SettingRow>

              {/* Sub-toggles (visible when enabled + granted) */}
              {notificationsEnabled && permissionStatus === 'granted' && (
                <SettingRow label={t('settings.blockNotifications')}>
                  <Switch
                    value={notificationPrefs.blocks}
                    onValueChange={() => handleToggleNotificationPref('blocks')}
                  />
                </SettingRow>
              )}
              {notificationsEnabled && permissionStatus === 'granted' && (
                <SettingRow label={t('settings.workerNotifications')}>
                  <Switch
                    value={notificationPrefs.workers}
                    onValueChange={() => handleToggleNotificationPref('workers')}
                  />
                </SettingRow>
              )}
              {notificationsEnabled && permissionStatus === 'granted' && (
                <SettingRow label={t('settings.bestDiffNotifications')}>
                  <Switch
                    value={notificationPrefs.bestDiff}
                    onValueChange={() => handleToggleNotificationPref('bestDiff')}
                  />
                </SettingRow>
              )}
            </SettingsCard>
          )}

          {/* ── Widgets ───────────────────────────────────── */}
          <SettingsCard header={t('settings.widgets')}>
            <View style={{ paddingHorizontal: ROW_H_PAD, paddingVertical: 14 }}>
              <View
                style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16 }}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="body" style={{ fontSize: 16, color: LABEL_COLOR }}>
                    {t('settings.widgetUpdates')}
                  </Text>
                  <Text
                    variant="mono"
                    style={{ fontSize: 11, lineHeight: 17, color: colors.textDim, marginTop: 6 }}
                  >
                    {t('settings.widgetUpdatesDesc')}
                  </Text>
                </View>
                <View style={{ marginTop: 2 }}>
                  <Switch
                    value={widgetUpdatesEnabled}
                    onValueChange={() => handleToggleWidgetUpdates()}
                  />
                </View>
              </View>

              {permissionStatus === 'denied' && widgetUpdatesEnabled && (
                <Text
                  variant="mono"
                  style={{ fontSize: 11, lineHeight: 17, color: colors.textFaint, marginTop: 8 }}
                >
                  {t('settings.widgetUpdatesPermissionHint')}
                </Text>
              )}
            </View>
          </SettingsCard>

          {/* ── About ─────────────────────────────────────── */}
          <SettingsCard header={t('settings.about')}>
            <SettingRow label={t('settings.version')}>
              <Text variant="mono" style={{ fontSize: 14, color: colors.textMuted }}>
                {appVersion}
              </Text>
            </SettingRow>

            <Pressable
              onPress={() => handleOpenLink(LINKS.parasite)}
              className="flex-row items-center justify-between active:opacity-70"
              style={{ paddingHorizontal: ROW_H_PAD, paddingVertical: 14 }}
            >
              <Text variant="body" style={{ fontSize: 16, color: LABEL_COLOR }}>
                {t('settings.website')}
              </Text>
              <Ionicons name="open-outline" size={17} color={colors.textMuted} />
            </Pressable>
          </SettingsCard>
        </View>
      </ScrollView>

      {/* Language Selector Sheet */}
      <LanguageSelectorSheet
        visible={showLanguageSheet}
        onClose={() => setShowLanguageSheet(false)}
      />
    </SafeAreaView>
  );
}

/** A label-left / control-right card row with consistent padding. */
function SettingRow({
  label,
  disabled = false,
  children,
}: {
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: ROW_H_PAD,
        paddingVertical: 14,
      }}
    >
      <Text
        variant="body"
        style={{ fontSize: 16, color: disabled ? colors.textMuted : LABEL_COLOR }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}
