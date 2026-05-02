/**
 * AvalonAuthSheet - Bottom sheet to collect the device admin password
 * for write operations that go through the web CGI (pool config).
 *
 * Pre-fills with the saved password if one exists for this miner. On
 * submit, persists to expo-secure-store keyed by MAC.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetTextInput,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Text } from '../Text';
import { haptics } from '@/utils/haptics';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';
import {
  getAvalonPassword,
  setAvalonPassword,
} from '@/utils/avalonAuth';

export interface AvalonAuthSheetProps {
  visible: boolean;
  /** Used as the secure-store key. Falls back to IP if MAC is unknown. */
  macOrIp: string;
  /** Called with the entered password (already persisted) */
  onSubmit: (password: string) => void;
  onClose: () => void;
}

export function AvalonAuthSheet({
  visible,
  macOrIp,
  onSubmit,
  onClose,
}: AvalonAuthSheetProps) {
  const { t } = useTranslation();
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();
  const [password, setPassword] = useState('');
  const [revealed, setRevealed] = useState(false);
  const snapPoints = useMemo(() => ['45%'], []);

  // Pre-fill with the stored password (if any) when the sheet opens.
  useEffect(() => {
    if (visible) {
      bottomSheetRef.current?.present();
      void (async () => {
        const stored = await getAvalonPassword(macOrIp);
        if (stored) setPassword(stored);
      })();
    } else {
      bottomSheetRef.current?.dismiss();
      setPassword('');
      setRevealed(false);
    }
  }, [visible, macOrIp]);

  const handleSubmit = useCallback(async () => {
    haptics.light();
    const trimmed = password.trim();
    if (!trimmed) return;
    await setAvalonPassword(macOrIp, trimmed);
    onSubmit(trimmed);
  }, [password, macOrIp, onSubmit]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        pressBehavior="close"
      />
    ),
    []
  );

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={snapPoints}
      onDismiss={onClose}
      backdropComponent={renderBackdrop}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      handleIndicatorStyle={{ backgroundColor: colors.textMuted }}
      backgroundStyle={{ backgroundColor: colors.surface }}
    >
      <BottomSheetView
        style={{
          flex: 1,
          paddingHorizontal: 16,
          paddingBottom: Math.max(insets.bottom, 16),
        }}
      >
        <View className="flex-row items-center justify-between pb-4">
          <Text variant="subtitle" className="font-semibold">
            {t('miners.avalonAdminPasswordTitle')}
          </Text>
          <Pressable onPress={onClose} className="p-2 -mr-2" hitSlop={8}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        <Text variant="caption" color="muted" className="mb-4">
          {t('miners.avalonAdminPasswordHint')}
        </Text>

        <View className="flex-row items-center bg-background rounded-lg border border-border">
          <BottomSheetTextInput
            value={password}
            onChangeText={setPassword}
            placeholder={t('miners.avalonAdminPasswordPlaceholder')}
            placeholderTextColor={colors.textMuted}
            secureTextEntry={!revealed}
            style={{
              flex: 1,
              paddingHorizontal: 16,
              paddingVertical: 12,
              color: colors.text,
              fontSize: 16,
            }}
            autoFocus
            maxLength={64}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />
          <Pressable
            onPress={() => setRevealed((v) => !v)}
            className="p-3"
            hitSlop={8}
          >
            <Ionicons
              name={revealed ? 'eye-off' : 'eye'}
              size={20}
              color={colors.textMuted}
            />
          </Pressable>
        </View>

        <View className="flex-row gap-3 mt-6">
          <Pressable
            onPress={onClose}
            className="flex-1 py-3 rounded-lg bg-background border border-border items-center"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text variant="body" className="font-medium">
              {t('common.cancel')}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleSubmit}
            disabled={password.trim().length === 0}
            className="flex-1 py-3 rounded-lg bg-foreground items-center"
            style={({ pressed }) => ({
              opacity: pressed || password.trim().length === 0 ? 0.5 : 1,
            })}
          >
            <Text variant="body" className="font-medium text-gray-950">
              {t('common.save')}
            </Text>
          </Pressable>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
}
