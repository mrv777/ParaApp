/**
 * SettingsMainScreen - User preferences and Bitcoin address management
 */

import { useState, useCallback, useEffect } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  TextInput,
  Switch,
  Linking,
} from 'react-native';
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
  type PollingInterval,
} from '@/store/settingsStore';
import { isValidBitcoinAddress } from '@/utils/validation';
import { truncateAddress } from '@/utils/formatting';
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

/** External links */
const LINKS = {
  parasite: 'https://parasite.space',
};

export function SettingsMainScreen({ navigation }: Props) {
  // Store
  const bitcoinAddress = useSettingsStore(selectBitcoinAddress);
  const temperatureUnit = useSettingsStore(selectTemperatureUnit);
  const pollingInterval = useSettingsStore(selectPollingInterval);
  const isPublic = useSettingsStore((s) => s.isPublicOnLeaderboard);

  // Actions
  const setBitcoinAddress = useSettingsStore((s) => s.setBitcoinAddress);
  const setTemperatureUnit = useSettingsStore((s) => s.setTemperatureUnit);
  const setPollingInterval = useSettingsStore((s) => s.setPollingInterval);
  const setPublicOnLeaderboard = useSettingsStore((s) => s.setPublicOnLeaderboard);

  // Local state
  const [addressInput, setAddressInput] = useState(bitcoinAddress || '');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isAddressValid, setIsAddressValid] = useState<boolean | null>(null);

  // Sync input with store
  useEffect(() => {
    if (bitcoinAddress !== null) {
      setAddressInput(bitcoinAddress);
      setIsAddressValid(true);
    }
  }, [bitcoinAddress]);

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
      haptics.success();
      setBitcoinAddress(trimmed);
      setIsAddressValid(true);
      setValidationError(null);
    } else {
      haptics.error();
      setIsAddressValid(false);
      setValidationError('Invalid Bitcoin address');
    }
  }, [addressInput, setBitcoinAddress]);

  const handleScanQR = useCallback(() => {
    haptics.light();
    navigation.navigate('QRScanner');
  }, [navigation]);

  const handleTemperatureSelect = useCallback(
    (unit: 'celsius' | 'fahrenheit') => {
      haptics.selection();
      setTemperatureUnit(unit);
    },
    [setTemperatureUnit]
  );

  const handlePollingSelect = useCallback(
    (interval: PollingInterval) => {
      haptics.selection();
      setPollingInterval(interval);
    },
    [setPollingInterval]
  );

  const handleVisibilityToggle = useCallback(
    (value: boolean) => {
      haptics.selection();
      setPublicOnLeaderboard(value);
    },
    [setPublicOnLeaderboard]
  );

  const handleOpenLink = useCallback((url: string) => {
    haptics.light();
    Linking.openURL(url);
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* Header */}
      <View className="px-4 py-4 border-b border-border">
        <Text variant="title" className="font-bold">
          Settings
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
          {/* Bitcoin Address Section */}
          <View className="px-4 py-4">
            <Text variant="caption" color="muted" className="mb-3 uppercase tracking-wide">
              Bitcoin Address
            </Text>

            {/* Address Input Row */}
            <View className="flex-row items-center gap-2">
              <View className="flex-1">
                <TextInput
                  value={addressInput}
                  onChangeText={handleAddressChange}
                  onBlur={handleAddressSubmit}
                  onSubmitEditing={handleAddressSubmit}
                  className="bg-secondary rounded-lg px-4 py-3"
                  style={{ color: colors.text }}
                  placeholderTextColor={colors.textMuted}
                  placeholder="bc1q... or 1... or 3..."
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                />
              </View>
              <Pressable
                onPress={handleScanQR}
                className="p-3 bg-secondary rounded-lg active:opacity-70"
                hitSlop={8}
              >
                <Ionicons name="qr-code-outline" size={24} color={colors.text} />
              </Pressable>
            </View>

            {/* Validation Feedback */}
            {(validationError || isAddressValid) && (
              <Animated.View
                entering={FadeIn.duration(200)}
                exiting={FadeOut.duration(200)}
                className="flex-row items-center mt-2"
              >
                <Ionicons
                  name={isAddressValid ? 'checkmark-circle' : 'alert-circle'}
                  size={16}
                  color={isAddressValid ? colors.success : colors.danger}
                />
                <Text
                  variant="caption"
                  color={isAddressValid ? 'success' : 'danger'}
                  className="ml-1"
                >
                  {isAddressValid
                    ? `Saved: ${truncateAddress(addressInput)}`
                    : validationError}
                </Text>
              </Animated.View>
            )}

            {/* Visibility Toggle */}
            <View className="flex-row items-center justify-between mt-4 pt-3 border-t border-border/50">
              <Text variant="body" color="muted">
                Show on leaderboard
              </Text>
              <Switch
                value={isPublic}
                onValueChange={handleVisibilityToggle}
                trackColor={{ false: colors.surface, true: colors.primary }}
                thumbColor={colors.background}
                ios_backgroundColor={colors.surface}
              />
            </View>
          </View>

          {/* Preferences Section */}
          <View className="px-4 py-4 border-t border-border">
            <Text variant="caption" color="muted" className="mb-4 uppercase tracking-wide">
              Preferences
            </Text>

            {/* Temperature Unit */}
            <View className="flex-row items-center justify-between mb-4">
              <Text variant="body">Temperature</Text>
              <View className="flex-row bg-secondary rounded-lg overflow-hidden">
                {TEMP_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    onPress={() => handleTemperatureSelect(opt.value)}
                    className={`px-4 py-2 ${
                      temperatureUnit === opt.value ? 'bg-primary' : ''
                    }`}
                  >
                    <Text
                      variant="body"
                      className={
                        temperatureUnit === opt.value
                          ? 'text-background font-medium'
                          : ''
                      }
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Polling Interval */}
            <View className="flex-row items-center justify-between">
              <Text variant="body">Polling Interval</Text>
              <View className="flex-row bg-secondary rounded-lg overflow-hidden">
                {POLLING_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    onPress={() => handlePollingSelect(opt.value)}
                    className={`px-3 py-2 ${
                      pollingInterval === opt.value ? 'bg-primary' : ''
                    }`}
                  >
                    <Text
                      variant="body"
                      className={
                        pollingInterval === opt.value
                          ? 'text-background font-medium'
                          : ''
                      }
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          {/* About Section */}
          <View className="px-4 py-4 border-t border-border">
            <Text variant="caption" color="muted" className="mb-3 uppercase tracking-wide">
              About
            </Text>

            {/* Version */}
            <View className="flex-row items-center justify-between py-3">
              <Text variant="body">Version</Text>
              <Text variant="body" color="muted">
                {appVersion}
              </Text>
            </View>

            {/* Parasite Pool Link */}
            <Pressable
              onPress={() => handleOpenLink(LINKS.parasite)}
              className="flex-row items-center justify-between py-3 border-t border-border/50 active:opacity-70"
            >
              <Text variant="body">Parasite Pool</Text>
              <Ionicons name="open-outline" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        </ScrollView>
    </SafeAreaView>
  );
}
