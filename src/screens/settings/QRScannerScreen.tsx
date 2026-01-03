/**
 * QRScannerScreen - Full-screen camera for scanning Bitcoin address QR codes
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Pressable, Linking, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { useSettingsStore } from '@/store/settingsStore';
import { isValidBitcoinAddress } from '@/utils/validation';
import { haptics } from '@/utils/haptics';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';
import type { SettingsStackScreenProps } from '@/types/navigation';

type Props = SettingsStackScreenProps<'QRScanner'>;

/**
 * Extract Bitcoin address from QR code data
 * Handles both plain addresses and BIP21 URIs (bitcoin:bc1q...?amount=0.001)
 */
function extractBitcoinAddress(data: string): string | null {
  if (!data) return null;

  // Try to match BIP21 URI or plain address
  const match = data.match(
    /^(?:bitcoin:)?([13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{39,59})/i
  );

  if (match && match[1]) {
    return match[1];
  }

  return null;
}

export function QRScannerScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const lastScanRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Store action
  const setBitcoinAddress = useSettingsStore((s) => s.setBitcoinAddress);

  const handleClose = useCallback(() => {
    haptics.light();
    navigation.goBack();
  }, [navigation]);

  const handleBarcodeScanned = useCallback(
    (result: BarcodeScanningResult) => {
      // Prevent duplicate scans
      if (scanned || result.data === lastScanRef.current) return;
      lastScanRef.current = result.data;

      const address = extractBitcoinAddress(result.data);

      if (address && isValidBitcoinAddress(address)) {
        setScanned(true);
        haptics.success();
        setBitcoinAddress(address);
        navigation.goBack();
      } else {
        // Show error but allow retry
        setScanError(t('qrScanner.notValidAddress'));
        haptics.warning();
        // Reset after a short delay to allow retry
        timeoutRef.current = setTimeout(() => {
          setScanError(null);
          lastScanRef.current = null;
        }, 2000);
      }
    },
    [scanned, setBitcoinAddress, navigation]
  );

  const handleRequestPermission = useCallback(async () => {
    haptics.light();
    await requestPermission();
  }, [requestPermission]);

  const handleOpenSettings = useCallback(() => {
    haptics.light();
    Linking.openSettings();
  }, []);

  // Permission loading state
  if (!permission) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <Text variant="body" color="muted">
          {t('qrScanner.loadingCamera')}
        </Text>
      </View>
    );
  }

  // Permission not granted
  if (!permission.granted) {
    return (
      <View className="flex-1 bg-background">
        <SafeAreaView className="flex-1">
          {/* Header */}
          <View className="flex-row items-center px-4 py-3">
            <Pressable onPress={handleClose} className="p-2 -ml-2 active:opacity-70" hitSlop={8}>
              <Ionicons name="close" size={28} color={colors.text} />
            </Pressable>
          </View>

          {/* Permission Request */}
          <View className="flex-1 items-center justify-center px-8">
            <View className="bg-secondary rounded-full p-6 mb-6">
              <Ionicons name="camera-outline" size={48} color={colors.textMuted} />
            </View>
            <Text variant="subtitle" className="font-semibold text-center mb-2">
              {t('qrScanner.cameraRequired')}
            </Text>
            <Text variant="body" color="muted" className="text-center mb-6">
              {t('qrScanner.cameraRequiredDesc')}
            </Text>

            {permission.canAskAgain ? (
              <Button onPress={handleRequestPermission} icon="camera">
                {t('qrScanner.allowCamera')}
              </Button>
            ) : (
              <View className="items-center">
                <Text variant="caption" color="muted" className="text-center mb-4">
                  {t('qrScanner.cameraDenied')}
                </Text>
                <Button variant="secondary" onPress={handleOpenSettings}>
                  {t('qrScanner.openSettings')}
                </Button>
              </View>
            )}
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // Camera active
  return (
    <View className="flex-1 bg-black">
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      />

      {/* Overlay */}
      <View style={StyleSheet.absoluteFillObject}>
        <SafeAreaView className="flex-1">
          {/* Header */}
          <View className="flex-row items-center justify-between px-4 py-3">
            <Pressable
              onPress={handleClose}
              className="p-2 -ml-2 bg-black/50 rounded-full active:opacity-70"
              hitSlop={8}
            >
              <Ionicons name="close" size={28} color="white" />
            </Pressable>
            <View className="bg-black/50 rounded-full px-4 py-2">
              <Text variant="body" style={{ color: 'white' }}>
                {t('qrScanner.title')}
              </Text>
            </View>
            <View style={{ width: 44 }} />
          </View>

          {/* Center viewfinder */}
          <View className="flex-1 items-center justify-center">
            <View className="w-64 h-64 relative">
              {/* Corner borders */}
              <View className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white rounded-tl-lg" />
              <View className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white rounded-tr-lg" />
              <View className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white rounded-bl-lg" />
              <View className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white rounded-br-lg" />
            </View>
          </View>

          {/* Bottom instruction */}
          <View className="px-8 pb-8 items-center">
            {scanError ? (
              <View className="bg-danger/80 rounded-full px-6 py-3">
                <Text variant="body" style={{ color: 'white' }}>
                  {scanError}
                </Text>
              </View>
            ) : (
              <View className="bg-black/50 rounded-full px-6 py-3">
                <Text variant="body" style={{ color: 'white' }} className="text-center">
                  {t('qrScanner.instruction')}
                </Text>
              </View>
            )}
          </View>
        </SafeAreaView>
      </View>
    </View>
  );
}
