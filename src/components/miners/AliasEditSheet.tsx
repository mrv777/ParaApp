/**
 * AliasEditSheet - Bottom sheet for editing miner alias
 */

import { useState, useCallback, useEffect } from 'react';
import { View, Pressable, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from '../Sheet';
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
  const [alias, setAlias] = useState(currentAlias);

  // Reset alias when the sheet opens
  useEffect(() => {
    if (visible) setAlias(currentAlias);
  }, [visible, currentAlias]);

  const handleSave = useCallback(() => {
    haptics.light();
    onSave(alias.trim());
  }, [alias, onSave]);

  const handleClear = useCallback(() => {
    haptics.light();
    setAlias('');
  }, []);

  return (
    <Sheet visible={visible} onClose={onClose} avoidKeyboard>
      {/* Header */}
      <View className="flex-row items-center justify-between pb-4">
        <Text variant="subtitle" className="font-semibold">
          {t('miners.editAlias')}
        </Text>
        <Pressable onPress={onClose} className="p-2 -mr-2" hitSlop={8}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
      </View>

      {/* Input section */}
      <View>
        <Text variant="caption" color="muted" className="mb-2">
          {t('miners.aliasLabel')}
        </Text>
        <View className="flex-row items-center bg-background rounded-lg border border-border">
          <TextInput
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
          onPress={onClose}
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
    </Sheet>
  );
}
