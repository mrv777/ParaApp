/**
 * LanguageSelectorSheet - Bottom sheet for language selection
 */

import { useCallback } from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from '../Sheet';
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
  const language = useSettingsStore(selectLanguage);
  const setLanguage = useSettingsStore((s) => s.setLanguage);

  const handleLanguageSelect = useCallback(
    (lang: Language) => {
      setLanguage(lang);
      changeLanguage(lang);
      onClose();
    },
    [setLanguage, onClose]
  );

  return (
    <Sheet visible={visible} onClose={onClose}>
      {/* Header */}
      <View className="flex-row items-center justify-between pb-2">
        <Text variant="subtitle" className="font-semibold">
          {t('settings.language')}
        </Text>
        <Pressable onPress={onClose} className="p-2 -mr-2" hitSlop={8}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
      </View>

      {/* Language Options */}
      <View className="bg-background rounded-lg overflow-hidden mt-1">
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
    </Sheet>
  );
}
