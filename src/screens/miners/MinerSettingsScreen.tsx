/**
 * MinerSettingsScreen - Configure miner hardware and pool settings
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Text } from '@/components/Text';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { SwipeToConfirm } from '@/components/SwipeToConfirm';
import { ErrorBanner } from '@/components/ErrorBanner';
import { useMinerStore, selectMiners } from '@/store/minerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { axeOS } from '@/api';
import { haptics } from '@/utils/haptics';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';
import type { MinersStackScreenProps } from '@/types/navigation';
import type { AsicConfig, MinerSettings } from '@/types/miner';

const { getAsicSettings, updateSettings, PARASITE_STRATUM_PRESET } = axeOS;

type Props = MinersStackScreenProps<'MinerSettings'>;

/** Fan speed options for manual mode */
const FAN_OPTIONS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

/** Generate fallback ASIC config from miner data when /api/system/asic fails */
function generateFallbackAsicConfig(miner: {
  ASICModel: string;
  deviceModel: string;
  frequency: number;
  voltage: number;
}): AsicConfig {
  // Default options based on BM1370 (most common)
  const defaultFreqOptions = [485, 500, 515, 525, 550, 575, 590, 600];
  const defaultVoltOptions = [1100, 1120, 1150, 1170, 1200, 1215, 1250];

  return {
    ASICModel: miner.ASICModel,
    deviceModel: miner.deviceModel,
    frequencyOptions: defaultFreqOptions,
    voltageOptions: defaultVoltOptions,
    defaultFrequency: 600,
    defaultVoltage: 1150,
    absMaxFrequency: 1000,
    absMaxVoltage: 1300,
  };
}

/** Pending change entry */
interface PendingChange {
  field: string;
  label: string;
  from: string;
  to: string;
}

export function MinerSettingsScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { ip } = route.params;

  // Store
  const miners = useMinerStore(selectMiners);
  const refreshMiner = useMinerStore((s) => s.refreshMiner);
  const bitcoinAddress = useSettingsStore((s) => s.bitcoinAddress);

  // Find the miner
  const miner = useMemo(() => miners.find((m) => m.ip === ip), [miners, ip]);

  // ASIC config from API
  const [asicConfig, setAsicConfig] = useState<AsicConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  // Form state
  const [frequency, setFrequency] = useState(0);
  const [voltage, setVoltage] = useState(0);
  const [fanSpeed, setFanSpeed] = useState(0);
  const [autoFan, setAutoFan] = useState(false);
  const [stratumUrl, setStratumUrl] = useState('');
  const [stratumPort, setStratumPort] = useState(0);
  const [stratumUser, setStratumUser] = useState('');
  const [stratumPassword, setStratumPassword] = useState('');

  // Custom value mode
  const [customFrequency, setCustomFrequency] = useState(false);
  const [customVoltage, setCustomVoltage] = useState(false);
  const [customFrequencyInput, setCustomFrequencyInput] = useState('');
  const [customVoltageInput, setCustomVoltageInput] = useState('');

  // Original values for comparison
  const [originalValues, setOriginalValues] = useState<MinerSettings | null>(null);

  // Apply state
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Fetch ASIC config on mount only (not on miner refresh)
  useEffect(() => {
    // Skip if already loaded
    if (asicConfig) return;

    async function fetchAsicConfig() {
      setConfigLoading(true);
      setConfigError(null);
      const result = await getAsicSettings(ip);
      if (result.success) {
        setAsicConfig(result.data);
      } else if (miner) {
        // Use fallback config for older firmware that doesn't have /api/system/asic
        setAsicConfig(generateFallbackAsicConfig(miner));
      } else {
        setConfigError(result.error.message || t('errors.failedToLoadConfig'));
      }
      setConfigLoading(false);
    }
    fetchAsicConfig();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ip, miner?.ASICModel]); // Only re-fetch if IP or ASIC model changes

  // Initialize pool and fan settings from miner data (always, even without asicConfig)
  useEffect(() => {
    if (miner) {
      // Pool settings
      setStratumUrl(miner.stratumUrl || '');
      setStratumPort(miner.stratumPort || 3333);
      setStratumUser(miner.stratumUser || '');
      setStratumPassword('x');
      // Fan settings
      setFanSpeed(miner.fanSpeed || 50);
      setAutoFan(miner.autoFanSpeed ?? false);
    }
  }, [miner]);

  // Initialize frequency/voltage when asicConfig is available
  useEffect(() => {
    if (miner && asicConfig) {
      setFrequency(miner.frequency || asicConfig.defaultFrequency);
      setVoltage(miner.voltage || asicConfig.defaultVoltage);
    }
  }, [miner, asicConfig]);

  // Set original values for change tracking
  useEffect(() => {
    if (miner && !configLoading) {
      const values: MinerSettings = {
        fanSpeed: miner.fanSpeed || 50,
        autoFanSpeed: miner.autoFanSpeed ?? false,
        stratumUrl: miner.stratumUrl || '',
        stratumPort: miner.stratumPort || 3333,
        stratumUser: miner.stratumUser || '',
        stratumPassword: 'x',
      };
      if (asicConfig) {
        values.frequency = miner.frequency || asicConfig.defaultFrequency;
        values.coreVoltage = miner.voltage || asicConfig.defaultVoltage;
      }
      setOriginalValues(values);
    }
  }, [miner, asicConfig, configLoading]);

  // Navigate back if miner removed
  useEffect(() => {
    if (!miner) {
      navigation.goBack();
    }
  }, [miner, navigation]);

  // Calculate pending changes
  const pendingChanges = useMemo<PendingChange[]>(() => {
    if (!originalValues) return [];
    const changes: PendingChange[] = [];

    // Frequency/voltage only when asicConfig is available
    if (asicConfig) {
      if (frequency !== originalValues.frequency) {
        changes.push({
          field: 'frequency',
          label: 'Frequency',
          from: `${originalValues.frequency} MHz`,
          to: `${frequency} MHz`,
        });
      }
      if (voltage !== originalValues.coreVoltage) {
        changes.push({
          field: 'voltage',
          label: 'Voltage',
          from: `${originalValues.coreVoltage} mV`,
          to: `${voltage} mV`,
        });
      }
    }
    // Fan changes always tracked (doesn't need asicConfig)
    if (autoFan !== originalValues.autoFanSpeed) {
      changes.push({
        field: 'autoFan',
        label: 'Fan Mode',
        from: originalValues.autoFanSpeed ? 'Auto' : 'Manual',
        to: autoFan ? 'Auto' : 'Manual',
      });
    }
    if (!autoFan && fanSpeed !== originalValues.fanSpeed) {
      changes.push({
        field: 'fanSpeed',
        label: 'Fan Speed',
        from: `${originalValues.fanSpeed}%`,
        to: `${fanSpeed}%`,
      });
    }
    if (stratumUrl !== originalValues.stratumUrl) {
      changes.push({
        field: 'stratumUrl',
        label: 'Pool URL',
        from: originalValues.stratumUrl || '(empty)',
        to: stratumUrl || '(empty)',
      });
    }
    if (stratumPort !== originalValues.stratumPort) {
      changes.push({
        field: 'stratumPort',
        label: 'Port',
        from: String(originalValues.stratumPort),
        to: String(stratumPort),
      });
    }
    if (stratumUser !== originalValues.stratumUser) {
      changes.push({
        field: 'stratumUser',
        label: 'Worker',
        from: originalValues.stratumUser || '(empty)',
        to: stratumUser || '(empty)',
      });
    }
    if (stratumPassword !== originalValues.stratumPassword) {
      changes.push({
        field: 'stratumPassword',
        label: 'Password',
        from: '****',
        to: '****',
      });
    }

    return changes;
  }, [frequency, voltage, fanSpeed, autoFan, stratumUrl, stratumPort, stratumUser, stratumPassword, originalValues, asicConfig]);

  const hasChanges = pendingChanges.length > 0;

  // Check for extreme values
  const frequencyWarning = useMemo(() => {
    if (!asicConfig) return null;
    const maxOption = Math.max(...asicConfig.frequencyOptions);
    if (frequency > maxOption) {
      return frequency > asicConfig.absMaxFrequency
        ? t('miners.exceedsMaximum')
        : t('miners.exceedsRecommended');
    }
    return null;
  }, [frequency, asicConfig, t]);

  const voltageWarning = useMemo(() => {
    if (!asicConfig) return null;
    const maxOption = Math.max(...asicConfig.voltageOptions);
    if (voltage > maxOption) {
      return voltage > asicConfig.absMaxVoltage
        ? t('miners.exceedsMaximum')
        : t('miners.exceedsRecommended');
    }
    return null;
  }, [voltage, asicConfig, t]);

  // Handlers
  const handleBack = useCallback(() => {
    haptics.light();
    navigation.goBack();
  }, [navigation]);

  const handleSetParasite = useCallback(() => {
    haptics.selection();
    setStratumUrl(PARASITE_STRATUM_PRESET.stratumUrl ?? 'parasite.wtf');
    setStratumPort(PARASITE_STRATUM_PRESET.stratumPort ?? 42069);
    // Use bitcoin address for worker if available
    if (bitcoinAddress && !stratumUser) {
      setStratumUser(bitcoinAddress);
    }
    setStratumPassword('x');
  }, [bitcoinAddress, stratumUser]);

  const handleApply = useCallback(async () => {
    if (!hasChanges) return;

    setApplying(true);
    setApplyError(null);

    const settings: MinerSettings = {};
    if (frequency !== originalValues?.frequency) {
      settings.frequency = frequency;
    }
    if (voltage !== originalValues?.coreVoltage) {
      settings.coreVoltage = voltage;
    }
    if (autoFan !== originalValues?.autoFanSpeed) {
      settings.autoFanSpeed = autoFan;
    }
    if (!autoFan && fanSpeed !== originalValues?.fanSpeed) {
      settings.fanSpeed = fanSpeed;
    }
    if (stratumUrl !== originalValues?.stratumUrl) {
      settings.stratumUrl = stratumUrl;
    }
    if (stratumPort !== originalValues?.stratumPort) {
      settings.stratumPort = stratumPort;
    }
    if (stratumUser !== originalValues?.stratumUser) {
      settings.stratumUser = stratumUser;
    }
    if (stratumPassword !== originalValues?.stratumPassword) {
      settings.stratumPassword = stratumPassword;
    }

    const result = await updateSettings(ip, settings);

    if (result.success) {
      haptics.success();
      // Refresh miner data
      await refreshMiner(ip);
      navigation.goBack();
    } else {
      haptics.error();
      setApplyError(result.error.message || t('errors.failedToApply'));
    }

    setApplying(false);
  }, [
    hasChanges,
    ip,
    frequency,
    voltage,
    fanSpeed,
    autoFan,
    stratumUrl,
    stratumPort,
    stratumUser,
    stratumPassword,
    originalValues,
    refreshMiner,
    navigation,
  ]);

  const handleFrequencySelect = useCallback((value: number) => {
    haptics.selection();
    setFrequency(value);
    setCustomFrequency(false);
  }, []);

  const handleVoltageSelect = useCallback((value: number) => {
    haptics.selection();
    setVoltage(value);
    setCustomVoltage(false);
  }, []);

  const handleFanSelect = useCallback((value: number) => {
    haptics.selection();
    setFanSpeed(value);
  }, []);

  const handleAutoFanToggle = useCallback((auto: boolean) => {
    haptics.selection();
    setAutoFan(auto);
  }, []);

  const handleCustomFrequencyToggle = useCallback(() => {
    haptics.selection();
    setCustomFrequency(true);
    setCustomFrequencyInput(String(frequency));
  }, [frequency]);

  const handleCustomVoltageToggle = useCallback(() => {
    haptics.selection();
    setCustomVoltage(true);
    setCustomVoltageInput(String(voltage));
  }, [voltage]);

  const handleCustomFrequencySubmit = useCallback(() => {
    const value = parseInt(customFrequencyInput, 10);
    if (!isNaN(value) && value > 0) {
      setFrequency(value);
    }
  }, [customFrequencyInput]);

  const handleCustomVoltageSubmit = useCallback(() => {
    const value = parseInt(customVoltageInput, 10);
    if (!isNaN(value) && value > 0) {
      setVoltage(value);
    }
  }, [customVoltageInput]);

  // Don't render if miner not found
  if (!miner) {
    return null;
  }

  const displayName = miner.alias || miner.hostname || miner.ip;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View className="flex-row items-center px-4 py-3 border-b border-border">
          <Pressable
            onPress={handleBack}
            className="p-2 -ml-2 mr-2"
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <View className="flex-1">
            <Text variant="subtitle" className="font-semibold">
              {t('miners.minerSettings')}
            </Text>
            <Text variant="caption" color="muted" numberOfLines={1}>
              {displayName}
            </Text>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: hasChanges ? 120 : 32 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Error Banner */}
          {applyError && (
            <ErrorBanner
              message={applyError}
              onDismiss={() => setApplyError(null)}
            />
          )}

          {/* Loading state */}
          {configLoading && (
            <View className="items-center justify-center py-12">
              <ActivityIndicator size="large" color={colors.primary} />
              <Text variant="body" color="muted" className="mt-3">
                {t('miners.loadingConfig')}
              </Text>
            </View>
          )}

          {/* Config error */}
          {configError && !configLoading && (
            <View className="px-4 py-3">
              <View className="bg-danger/10 rounded-lg p-4">
                <Text variant="body" color="danger">
                  {configError}
                </Text>
                <Text variant="caption" color="muted" className="mt-2">
                  {t('miners.hardwareUnavailable')}
                </Text>
              </View>
            </View>
          )}

          {/* Hardware Settings */}
          {asicConfig && !configLoading && (
            <View className="px-4 py-4">
              <Text variant="caption" color="muted" className="mb-3 uppercase tracking-wide">
                {t('miners.hardware')}
              </Text>

              {/* Frequency */}
              <View className="mb-4">
                <View className="flex-row justify-between items-center mb-2">
                  <Text variant="body">{t('miners.frequency')}</Text>
                  <View className="flex-row items-center gap-2">
                    {frequencyWarning && (
                      <Badge variant="warning" size="sm">
                        {frequencyWarning}
                      </Badge>
                    )}
                    <Text variant="body" className="font-medium">
                      {frequency} MHz
                    </Text>
                  </View>
                </View>
                {!customFrequency ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="-mx-1"
                  >
                    <View className="flex-row gap-2 px-1">
                      {asicConfig.frequencyOptions.map((opt) => (
                        <Pressable
                          key={opt}
                          onPress={() => handleFrequencySelect(opt)}
                          className={`px-3 py-2 rounded-lg ${
                            frequency === opt ? 'bg-primary' : 'bg-secondary'
                          }`}
                        >
                          <Text
                            variant="body"
                            className={frequency === opt ? 'text-background font-medium' : ''}
                          >
                            {opt}
                          </Text>
                        </Pressable>
                      ))}
                      <Pressable
                        onPress={handleCustomFrequencyToggle}
                        className="px-3 py-2 rounded-lg bg-secondary border border-border"
                      >
                        <Text variant="body" color="muted">
                          {t('common.custom')}
                        </Text>
                      </Pressable>
                    </View>
                  </ScrollView>
                ) : (
                  <View className="flex-row items-center gap-2">
                    <TextInput
                      value={customFrequencyInput}
                      onChangeText={setCustomFrequencyInput}
                      onBlur={handleCustomFrequencySubmit}
                      onSubmitEditing={handleCustomFrequencySubmit}
                      keyboardType="number-pad"
                      returnKeyType="done"
                      className="flex-1 bg-secondary rounded-lg px-4 py-3 text-foreground"
                      style={{ color: colors.text }}
                      placeholderTextColor={colors.textMuted}
                      placeholder={t('miners.enterFrequency')}
                      autoFocus
                    />
                    <Pressable
                      onPress={() => setCustomFrequency(false)}
                      className="p-3 bg-secondary rounded-lg"
                    >
                      <Ionicons name="close" size={20} color={colors.textMuted} />
                    </Pressable>
                  </View>
                )}
              </View>

              {/* Voltage */}
              <View className="mb-4">
                <View className="flex-row justify-between items-center mb-2">
                  <Text variant="body">{t('miners.voltage')}</Text>
                  <View className="flex-row items-center gap-2">
                    {voltageWarning && (
                      <Badge variant="warning" size="sm">
                        {voltageWarning}
                      </Badge>
                    )}
                    <Text variant="body" className="font-medium">
                      {voltage} mV
                    </Text>
                  </View>
                </View>
                {!customVoltage ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="-mx-1"
                  >
                    <View className="flex-row gap-2 px-1">
                      {asicConfig.voltageOptions.map((opt) => (
                        <Pressable
                          key={opt}
                          onPress={() => handleVoltageSelect(opt)}
                          className={`px-3 py-2 rounded-lg ${
                            voltage === opt ? 'bg-primary' : 'bg-secondary'
                          }`}
                        >
                          <Text
                            variant="body"
                            className={voltage === opt ? 'text-background font-medium' : ''}
                          >
                            {opt}
                          </Text>
                        </Pressable>
                      ))}
                      <Pressable
                        onPress={handleCustomVoltageToggle}
                        className="px-3 py-2 rounded-lg bg-secondary border border-border"
                      >
                        <Text variant="body" color="muted">
                          {t('common.custom')}
                        </Text>
                      </Pressable>
                    </View>
                  </ScrollView>
                ) : (
                  <View className="flex-row items-center gap-2">
                    <TextInput
                      value={customVoltageInput}
                      onChangeText={setCustomVoltageInput}
                      onBlur={handleCustomVoltageSubmit}
                      onSubmitEditing={handleCustomVoltageSubmit}
                      keyboardType="number-pad"
                      returnKeyType="done"
                      className="flex-1 bg-secondary rounded-lg px-4 py-3 text-foreground"
                      style={{ color: colors.text }}
                      placeholderTextColor={colors.textMuted}
                      placeholder={t('miners.enterVoltage')}
                      autoFocus
                    />
                    <Pressable
                      onPress={() => setCustomVoltage(false)}
                      className="p-3 bg-secondary rounded-lg"
                    >
                      <Ionicons name="close" size={20} color={colors.textMuted} />
                    </Pressable>
                  </View>
                )}
              </View>

            </View>
          )}

          {/* Fan Control - shows even without asicConfig */}
          {miner && !configLoading && (
            <View className="px-4 py-4 border-t border-border">
              <Text variant="caption" color="muted" className="mb-3 uppercase tracking-wide">
                {t('miners.fanControl')}
              </Text>
              <View>
                <View className="flex-row justify-between items-center mb-2">
                  <Text variant="body">{t('miners.fanSpeed')}</Text>
                  {!autoFan && (
                    <Text variant="body" className="font-medium">
                      {fanSpeed}%
                    </Text>
                  )}
                </View>
                {/* Auto/Manual segmented control */}
                <View className="flex-row bg-secondary rounded-lg p-1 mb-3">
                  <Pressable
                    onPress={() => handleAutoFanToggle(true)}
                    className={`flex-1 py-2 rounded-md ${
                      autoFan ? 'bg-primary' : ''
                    }`}
                  >
                    <Text
                      variant="body"
                      className={`text-center ${autoFan ? 'text-background font-medium' : ''}`}
                    >
                      {t('miners.auto')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleAutoFanToggle(false)}
                    className={`flex-1 py-2 rounded-md ${
                      !autoFan ? 'bg-primary' : ''
                    }`}
                  >
                    <Text
                      variant="body"
                      className={`text-center ${!autoFan ? 'text-background font-medium' : ''}`}
                    >
                      {t('common.manual')}
                    </Text>
                  </Pressable>
                </View>
                {/* Auto mode info */}
                {autoFan && (
                  <View className="bg-secondary/50 rounded-lg p-3">
                    <Text variant="caption" color="muted">
                      {t('miners.autoFanEnabled')}
                    </Text>
                    <Text variant="body" className="mt-1">
                      {t('miners.currentFanStatus', { speed: miner?.fanSpeed ?? 0, rpm: miner?.fanRpm ?? 0 })}
                    </Text>
                  </View>
                )}
                {/* Manual mode percentage buttons */}
                {!autoFan && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="-mx-1"
                  >
                    <View className="flex-row gap-2 px-1">
                      {FAN_OPTIONS.map((opt) => (
                        <Pressable
                          key={opt}
                          onPress={() => handleFanSelect(opt)}
                          className={`px-3 py-2 rounded-lg ${
                            fanSpeed === opt ? 'bg-primary' : 'bg-secondary'
                          }`}
                        >
                          <Text
                            variant="body"
                            className={fanSpeed === opt ? 'text-background font-medium' : ''}
                          >
                            {opt}%
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                )}
              </View>
            </View>
          )}

          {/* Pool Configuration */}
          <View className="px-4 py-4 border-t border-border">
            <Text variant="caption" color="muted" className="mb-3 uppercase tracking-wide">
              {t('miners.poolConfiguration')}
            </Text>

            {/* Stratum URL */}
            <View className="mb-3">
              <Text variant="caption" color="muted" className="mb-1">
                {t('miners.stratumUrl')}
              </Text>
              <TextInput
                value={stratumUrl}
                onChangeText={setStratumUrl}
                className="bg-secondary rounded-lg px-4 py-3"
                style={{ color: colors.text }}
                placeholderTextColor={colors.textMuted}
                placeholder={t('miners.stratumPlaceholder')}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Port */}
            <View className="mb-3">
              <Text variant="caption" color="muted" className="mb-1">
                {t('miners.port')}
              </Text>
              <TextInput
                value={String(stratumPort)}
                onChangeText={(text) => {
                  const num = parseInt(text, 10);
                  if (!isNaN(num)) setStratumPort(num);
                  else if (text === '') setStratumPort(0);
                }}
                className="bg-secondary rounded-lg px-4 py-3"
                style={{ color: colors.text }}
                placeholderTextColor={colors.textMuted}
                placeholder={t('miners.portPlaceholder')}
                keyboardType="number-pad"
              />
            </View>

            {/* Worker */}
            <View className="mb-3">
              <Text variant="caption" color="muted" className="mb-1">
                {t('miners.worker')}
              </Text>
              <TextInput
                value={stratumUser}
                onChangeText={setStratumUser}
                className="bg-secondary rounded-lg px-4 py-3"
                style={{ color: colors.text }}
                placeholderTextColor={colors.textMuted}
                placeholder={t('miners.workerPlaceholder')}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Password */}
            <View className="mb-4">
              <Text variant="caption" color="muted" className="mb-1">
                {t('miners.password')}
              </Text>
              <TextInput
                value={stratumPassword}
                onChangeText={setStratumPassword}
                className="bg-secondary rounded-lg px-4 py-3"
                style={{ color: colors.text }}
                placeholderTextColor={colors.textMuted}
                placeholder={t('miners.passwordPlaceholder')}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Parasite Preset Button */}
            <Button
              variant="secondary"
              onPress={handleSetParasite}
              icon="flash"
            >
              {t('miners.setToParasite')}
            </Button>
          </View>

          {/* Pending Changes Summary */}
          {hasChanges && (
            <Animated.View
              entering={FadeIn}
              exiting={FadeOut}
              className="px-4 py-4 border-t border-border"
            >
              <Text variant="caption" color="muted" className="mb-3 uppercase tracking-wide">
                {t('miners.pendingChanges')}
              </Text>
              <View className="bg-secondary rounded-lg p-3 gap-2">
                {pendingChanges.map((change) => (
                  <View key={change.field} className="flex-row items-center">
                    <Text variant="body" color="muted" className="w-24">
                      {change.label}
                    </Text>
                    <Text variant="caption" color="muted" className="mx-2">
                      {change.from}
                    </Text>
                    <Ionicons name="arrow-forward" size={14} color={colors.textMuted} />
                    <Text variant="body" className="ml-2 font-medium">
                      {change.to}
                    </Text>
                  </View>
                ))}
              </View>
            </Animated.View>
          )}
        </ScrollView>

        {/* Footer with SwipeToConfirm */}
        {hasChanges && (
          <Animated.View
            entering={FadeIn}
            exiting={FadeOut}
            className="absolute bottom-0 left-0 right-0 bg-background border-t border-border"
          >
            <SafeAreaView edges={['bottom']} className="px-4 py-4">
              {applying ? (
                <View className="flex-row items-center justify-center py-3">
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text variant="body" color="muted" className="ml-2">
                    {t('miners.applyingSettings')}
                  </Text>
                </View>
              ) : (
                <SwipeToConfirm
                  label={t('miners.swipeToApply')}
                  confirmLabel={t('common.applied')}
                  onConfirm={handleApply}
                  variant="danger"
                />
              )}
            </SafeAreaView>
          </Animated.View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
