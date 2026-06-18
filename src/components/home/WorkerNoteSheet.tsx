/**
 * WorkerNoteSheet - Bottom sheet for editing worker notes
 */

import { useState, useCallback, useEffect } from 'react';
import { View, Pressable, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from '../Sheet';
import { Text } from '../Text';
import { haptics } from '@/utils/haptics';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';

export interface WorkerNoteSheetProps {
  visible: boolean;
  workerName: string;
  currentNote: string;
  onSave: (note: string) => void;
  onClose: () => void;
}

export function WorkerNoteSheet({
  visible,
  workerName,
  currentNote,
  onSave,
  onClose,
}: WorkerNoteSheetProps) {
  const { t } = useTranslation();
  const [note, setNote] = useState(currentNote);

  // Reset note when the sheet opens
  useEffect(() => {
    if (visible) setNote(currentNote);
  }, [visible, currentNote]);

  const handleSave = useCallback(() => {
    haptics.light();
    onSave(note.trim());
  }, [note, onSave]);

  const handleClear = useCallback(() => {
    haptics.light();
    setNote('');
  }, []);

  return (
    <Sheet visible={visible} onClose={onClose} avoidKeyboard>
      {/* Header */}
      <View className="flex-row items-center justify-between pb-4">
        <Text variant="subtitle" className="font-semibold">
          {t('home.editWorkerNote')}
        </Text>
        <Pressable onPress={onClose} className="p-2 -mr-2" hitSlop={8}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
      </View>

      {/* Worker name context */}
      <Text variant="caption" color="muted" className="mb-3">
        {workerName}
      </Text>

      {/* Input section */}
      <View>
        <View className="flex-row items-center bg-background rounded-lg border border-border">
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={t('home.noteHint')}
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
            autoCapitalize="sentences"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />
          {note.length > 0 && (
            <Pressable onPress={handleClear} className="p-3" hitSlop={8}>
              <Ionicons name="close-circle" size={20} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
        <Text variant="caption" color="muted" className="mt-1">
          {note.length}/32
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
          <Text variant="body" className="font-medium" style={{ color: '#000000' }}>
            {t('common.save')}
          </Text>
        </Pressable>
      </View>
    </Sheet>
  );
}
