/**
 * AliasEditSheet - Bottom sheet for editing miner alias
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

export interface AliasEditSheetProps {
  visible: boolean;
  currentAlias: string;
  hostname: string;
  onSave: (alias: string) => void;
  onClose: () => void;
}

export function AliasEditSheet({
  visible,
  currentAlias,
  hostname,
  onSave,
  onClose,
}: AliasEditSheetProps) {
  const { t } = useTranslation();
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();
  const [alias, setAlias] = useState(currentAlias);
  const snapPoints = useMemo(() => ['40%'], []);

  // Reset alias when modal opens
  useEffect(() => {
    if (visible) {
      setAlias(currentAlias);
      bottomSheetRef.current?.present();
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [visible, currentAlias]);

  const handleDismiss = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleSave = useCallback(() => {
    haptics.light();
    onSave(alias.trim());
  }, [alias, onSave]);

  const handleClear = useCallback(() => {
    haptics.light();
    setAlias('');
  }, []);

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
      onDismiss={handleDismiss}
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
        {/* Header */}
        <View className="flex-row items-center justify-between pb-4">
          <Text variant="subtitle" className="font-semibold">
            {t('miners.editAlias')}
          </Text>
          <Pressable onPress={handleDismiss} className="p-2 -mr-2" hitSlop={8}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        {/* Input section */}
        <View>
          <Text variant="caption" color="muted" className="mb-2">
            {t('miners.aliasLabel')}
          </Text>
          <View className="flex-row items-center bg-background rounded-lg border border-border">
            <BottomSheetTextInput
              value={alias}
              onChangeText={setAlias}
              placeholder={hostname || t('miners.enterAlias')}
              placeholderTextColor={colors.textMuted}
              style={{
                flex: 1,
                paddingHorizontal: 16,
                paddingVertical: 12,
                color: colors.text,
                fontSize: 16,
              }}
              autoFocus
              maxLength={32}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
            {alias.length > 0 && (
              <Pressable onPress={handleClear} className="p-3" hitSlop={8}>
                <Ionicons name="close-circle" size={20} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
          <Text variant="caption" color="muted" className="mt-1">
            {t('miners.aliasHint')}
          </Text>
        </View>

        {/* Buttons */}
        <View className="flex-row gap-3 mt-6">
          <Pressable
            onPress={handleDismiss}
            className="flex-1 py-3 rounded-lg bg-background border border-border items-center"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text variant="body" className="font-medium">
              {t('common.cancel')}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleSave}
            className="flex-1 py-3 rounded-lg bg-foreground items-center"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
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
