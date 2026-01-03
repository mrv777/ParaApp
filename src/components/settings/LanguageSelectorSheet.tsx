/**
 * LanguageSelectorSheet - Bottom sheet for language selection
 */

import { useCallback, useRef, useMemo, useEffect } from 'react';
import { View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Text } from '../Text';
import { haptics } from '@/utils/haptics';
import { colors } from '@/constants/colors';
import { useTranslation, changeLanguage } from '@/i18n';
import {
  useSettingsStore,
  selectLanguage,
  type Language,
} from '@/store/settingsStore';

export interface LanguageSelectorSheetProps {
  visible: boolean;
  onClose: () => void;
}

interface LanguageOptionProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

function LanguageOption({ label, selected, onPress }: LanguageOptionProps) {
  const handlePress = () => {
    haptics.selection();
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      className="flex-row items-center justify-between py-3 px-4"
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <Text variant="body" className={selected ? 'font-medium' : ''}>
        {label}
      </Text>
      {selected && (
        <Ionicons name="checkmark" size={20} color={colors.success} />
      )}
    </Pressable>
  );
}

const LANGUAGE_OPTIONS: { value: Language; labelKey: string }[] = [
  { value: 'auto', labelKey: 'settings.languageNames.auto' },
  { value: 'en', labelKey: 'settings.languageNames.en' },
  { value: 'es', labelKey: 'settings.languageNames.es' },
  { value: 'de', labelKey: 'settings.languageNames.de' },
  { value: 'fr', labelKey: 'settings.languageNames.fr' },
  { value: 'pt', labelKey: 'settings.languageNames.pt' },
];

export function LanguageSelectorSheet({
  visible,
  onClose,
}: LanguageSelectorSheetProps) {
  const { t } = useTranslation();
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();
  const snapPoints = useMemo(() => ['45%'], []);

  const language = useSettingsStore(selectLanguage);
  const setLanguage = useSettingsStore((s) => s.setLanguage);

  useEffect(() => {
    if (visible) {
      bottomSheetRef.current?.present();
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [visible]);

  const handleDismiss = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleLanguageSelect = useCallback(
    (lang: Language) => {
      setLanguage(lang);
      changeLanguage(lang);
      onClose();
    },
    [setLanguage, onClose]
  );

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
      handleIndicatorStyle={{ backgroundColor: colors.textMuted }}
      backgroundStyle={{ backgroundColor: colors.surface }}
    >
      <BottomSheetView style={{ flex: 1 }}>
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pb-2">
          <Text variant="subtitle" className="font-semibold">
            {t('settings.language')}
          </Text>
          <Pressable
            onPress={handleDismiss}
            className="p-2 -mr-2"
            hitSlop={8}
          >
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        {/* Language Options */}
        <View
          className="bg-background mx-4 rounded-lg overflow-hidden"
          style={{ marginBottom: Math.max(insets.bottom, 16) }}
        >
          {LANGUAGE_OPTIONS.map((option, index) => (
            <View key={option.value}>
              {index > 0 && <View className="h-px bg-border mx-4" />}
              <LanguageOption
                label={t(option.labelKey)}
                selected={language === option.value}
                onPress={() => handleLanguageSelect(option.value)}
              />
            </View>
          ))}
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
}
