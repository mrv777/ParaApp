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
import { getAsicSettings, updateSettings, PARASITE_STRATUM_PRESET } from '@/api/bitaxe';
import { haptics } from '@/utils/haptics';
import { colors } from '@/constants/colors';
import type { MinersStackScreenProps } from '@/types/navigation';
import type { AsicConfig, MinerSettings } from '@/types/miner';

type Props = MinersStackScreenProps<'MinerSettings'>;

/** Fan speed options (0 = auto) */
const FAN_OPTIONS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

/** Pending change entry */
interface PendingChange {
  field: string;
  label: string;
  from: string;
  to: string;
}

export function MinerSettingsScreen({ route, navigation }: Props) {
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

  // Fetch ASIC config on mount
  useEffect(() => {
    async function fetchAsicConfig() {
      setConfigLoading(true);
      setConfigError(null);
      const result = await getAsicSettings(ip);
      if (result.success) {
        setAsicConfig(result.data);
      } else {
        setConfigError(result.error.message || 'Failed to load ASIC configuration');
      }
      setConfigLoading(false);
    }
    fetchAsicConfig();
  }, [ip]);

  // Initialize form values from miner data
  useEffect(() => {
    if (miner && asicConfig) {
      // Use actual current values from miner
      const currentFrequency = miner.frequency || asicConfig.defaultFrequency;
      const currentVoltage = miner.voltage || asicConfig.defaultVoltage;
      const currentFanSpeed = miner.fanSpeed || 0;

      setFrequency(currentFrequency);
      setVoltage(currentVoltage);
      setFanSpeed(currentFanSpeed);
      setStratumUrl(miner.stratumUrl || '');
      setStratumPort(miner.stratumPort || 3333);
      setStratumUser(miner.stratumUser || '');
      setStratumPassword('x'); // Default password

      setOriginalValues({
        frequency: currentFrequency,
        coreVoltage: currentVoltage,
        fanSpeed: currentFanSpeed,
        stratumUrl: miner.stratumUrl || '',
        stratumPort: miner.stratumPort || 3333,
        stratumUser: miner.stratumUser || '',
        stratumPassword: 'x',
      });
    }
  }, [miner, asicConfig]);

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
    if (fanSpeed !== originalValues.fanSpeed) {
      const fromStr = originalValues.fanSpeed === 0 ? 'Auto' : `${originalValues.fanSpeed}%`;
      const toStr = fanSpeed === 0 ? 'Auto' : `${fanSpeed}%`;
      changes.push({
        field: 'fanSpeed',
        label: 'Fan Speed',
        from: fromStr,
        to: toStr,
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
  }, [frequency, voltage, fanSpeed, stratumUrl, stratumPort, stratumUser, stratumPassword, originalValues]);

  const hasChanges = pendingChanges.length > 0;

  // Check for extreme values
  const frequencyWarning = useMemo(() => {
    if (!asicConfig) return null;
    const maxOption = Math.max(...asicConfig.frequencyOptions);
    if (frequency > maxOption) {
      return frequency > asicConfig.absMaxFrequency
        ? 'Exceeds absolute maximum!'
        : 'Exceeds recommended range';
    }
    return null;
  }, [frequency, asicConfig]);

  const voltageWarning = useMemo(() => {
    if (!asicConfig) return null;
    const maxOption = Math.max(...asicConfig.voltageOptions);
    if (voltage > maxOption) {
      return voltage > asicConfig.absMaxVoltage
        ? 'Exceeds absolute maximum!'
        : 'Exceeds recommended range';
    }
    return null;
  }, [voltage, asicConfig]);

  // Handlers
  const handleBack = useCallback(() => {
    haptics.light();
    navigation.goBack();
  }, [navigation]);

  const handleSetParasite = useCallback(() => {
    haptics.selection();
    setStratumUrl(PARASITE_STRATUM_PRESET.stratumUrl ?? 'stratum.parasite.space');
    setStratumPort(PARASITE_STRATUM_PRESET.stratumPort ?? 3333);
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
    if (fanSpeed !== originalValues?.fanSpeed) {
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
      setApplyError(result.error.message || 'Failed to apply settings');
    }

    setApplying(false);
  }, [
    hasChanges,
    ip,
    frequency,
    voltage,
    fanSpeed,
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
              Miner Settings
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
                Loading configuration...
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
                  Hardware settings unavailable. You can still configure pool settings.
                </Text>
              </View>
            </View>
          )}

          {/* Hardware Settings */}
          {asicConfig && !configLoading && (
            <View className="px-4 py-4">
              <Text variant="caption" color="muted" className="mb-3 uppercase tracking-wide">
                Hardware
              </Text>

              {/* Frequency */}
              <View className="mb-4">
                <View className="flex-row justify-between items-center mb-2">
                  <Text variant="body">Frequency</Text>
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
                          Custom
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
                      placeholder="Enter frequency (MHz)"
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
                  <Text variant="body">Voltage</Text>
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
                          Custom
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
                      placeholder="Enter voltage (mV)"
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

              {/* Fan Speed */}
              <View>
                <View className="flex-row justify-between items-center mb-2">
                  <Text variant="body">Fan Speed</Text>
                  <Text variant="body" className="font-medium">
                    {fanSpeed === 0 ? 'Auto' : `${fanSpeed}%`}
                  </Text>
                </View>
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
                          {opt === 0 ? 'Auto' : `${opt}%`}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>
            </View>
          )}

          {/* Pool Configuration */}
          <View className="px-4 py-4 border-t border-border">
            <Text variant="caption" color="muted" className="mb-3 uppercase tracking-wide">
              Pool Configuration
            </Text>

            {/* Stratum URL */}
            <View className="mb-3">
              <Text variant="caption" color="muted" className="mb-1">
                Stratum URL
              </Text>
              <TextInput
                value={stratumUrl}
                onChangeText={setStratumUrl}
                className="bg-secondary rounded-lg px-4 py-3"
                style={{ color: colors.text }}
                placeholderTextColor={colors.textMuted}
                placeholder="stratum.pool.com"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Port */}
            <View className="mb-3">
              <Text variant="caption" color="muted" className="mb-1">
                Port
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
                placeholder="3333"
                keyboardType="number-pad"
              />
            </View>

            {/* Worker */}
            <View className="mb-3">
              <Text variant="caption" color="muted" className="mb-1">
                Worker
              </Text>
              <TextInput
                value={stratumUser}
                onChangeText={setStratumUser}
                className="bg-secondary rounded-lg px-4 py-3"
                style={{ color: colors.text }}
                placeholderTextColor={colors.textMuted}
                placeholder="your_bitcoin_address.worker_name"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Password */}
            <View className="mb-4">
              <Text variant="caption" color="muted" className="mb-1">
                Password
              </Text>
              <TextInput
                value={stratumPassword}
                onChangeText={setStratumPassword}
                className="bg-secondary rounded-lg px-4 py-3"
                style={{ color: colors.text }}
                placeholderTextColor={colors.textMuted}
                placeholder="x"
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
              Set to Parasite Pool
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
                Pending Changes
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
                    Applying settings...
                  </Text>
                </View>
              ) : (
                <SwipeToConfirm
                  label="Swipe to apply"
                  confirmLabel="Applied!"
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
