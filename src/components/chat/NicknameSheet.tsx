/**
 * Nickname editor. Sets/clears the caller's moderated chat nickname; an empty
 * value clears it (falls back to the truncated address).
 */

import { useState } from 'react';
import { View, TextInput } from 'react-native';
import Toast from 'react-native-toast-message';

import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { putChatNickname } from '@/api/chat';
import { isError } from '@/api/client';
import { colors } from '@/constants/colors';
import { MAX_NICKNAME_LENGTH } from '@/constants/chat';
import { useTranslation } from '@/i18n';
import { haptics } from '@/utils/haptics';

interface NicknameSheetProps {
  visible: boolean;
  onClose: () => void;
  token: string | null;
  initialNickname?: string;
}

export function NicknameSheet({
  visible,
  onClose,
  token,
  initialNickname = '',
}: NicknameSheetProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialNickname);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!token) {
      onClose();
      return;
    }
    setSaving(true);
    const result = await putChatNickname(token, value.trim());
    setSaving(false);
    if (isError(result) || !result.data.success) {
      haptics.warning();
      Toast.show({ type: 'error', text1: t('chat.nicknameError') });
      return;
    }
    haptics.success();
    Toast.show({ type: 'success', text1: t('chat.nicknameSaved') });
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} avoidKeyboard>
      <View className="px-4 pt-2 pb-4">
        <Text variant="subtitle" className="mb-1">
          {t('chat.nickname')}
        </Text>
        <Text variant="caption" color="muted" className="mb-3">
          {t('chat.nicknameHint')}
        </Text>
        <TextInput
          className="text-foreground border border-border px-3 py-2 mb-4"
          style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
          placeholder={t('chat.nicknamePlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={value}
          onChangeText={setValue}
          maxLength={MAX_NICKNAME_LENGTH}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={handleSave}
        />
        <Button onPress={handleSave} loading={saving} disabled={saving}>
          {t('common.save')}
        </Button>
      </View>
    </Sheet>
  );
}
