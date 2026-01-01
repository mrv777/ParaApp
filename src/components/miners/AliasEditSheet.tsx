/**
 * AliasEditSheet - Bottom sheet for editing miner alias
 */

import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Modal,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Text } from '../Text';
import { haptics } from '@/utils/haptics';
import { colors } from '@/constants/colors';

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
  const [alias, setAlias] = useState(currentAlias);

  // Reset alias when modal opens
  useEffect(() => {
    if (visible) {
      setAlias(currentAlias);
    }
  }, [visible, currentAlias]);

  const handleClose = useCallback(() => {
    haptics.light();
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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 justify-end"
      >
        {/* Backdrop */}
        <Pressable className="flex-1 bg-black/60" onPress={handleClose}>
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(200)}
            className="flex-1"
          />
        </Pressable>

        {/* Bottom sheet content */}
        <View className="bg-secondary rounded-t-2xl pb-8">
          {/* Handle bar */}
          <View className="items-center py-3">
            <View className="w-10 h-1 bg-muted/30 rounded-full" />
          </View>

          {/* Header */}
          <View className="flex-row items-center justify-between px-4 pb-4">
            <Text variant="subtitle" className="font-semibold">
              Edit Alias
            </Text>
            <Pressable
              onPress={handleClose}
              className="p-2 -mr-2"
              hitSlop={8}
            >
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          {/* Input section */}
          <View className="px-4">
            <Text variant="caption" color="muted" className="mb-2">
              Custom name for this miner
            </Text>
            <View className="flex-row items-center bg-background rounded-lg border border-border">
              <TextInput
                value={alias}
                onChangeText={setAlias}
                placeholder={hostname || 'Enter alias'}
                placeholderTextColor={colors.textMuted}
                className="flex-1 px-4 py-3 text-foreground text-base"
                autoFocus
                maxLength={32}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleSave}
              />
              {alias.length > 0 && (
                <Pressable
                  onPress={handleClear}
                  className="p-3"
                  hitSlop={8}
                >
                  <Ionicons
                    name="close-circle"
                    size={20}
                    color={colors.textMuted}
                  />
                </Pressable>
              )}
            </View>
            <Text variant="caption" color="muted" className="mt-1">
              Leave empty to use hostname
            </Text>
          </View>

          {/* Buttons */}
          <View className="flex-row gap-3 px-4 mt-6">
            <Pressable
              onPress={handleClose}
              className="flex-1 py-3 rounded-lg bg-background border border-border items-center"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text variant="body" className="font-medium">
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              className="flex-1 py-3 rounded-lg bg-foreground items-center"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text variant="body" className="font-medium text-background">
                Save
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
