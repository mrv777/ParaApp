/**
 * Nickname editor. Sets/clears the caller's moderated chat nickname; an empty
 * value clears it (falls back to the truncated address).
 */

import { useEffect, useState } from 'react';
import { View, TextInput } from 'react-native';
import Toast from 'react-native-toast-message';

import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { putChatNickname, runTokenAction } from '@/api/chat';
import { isError } from '@/api/client';
import { colors } from '@/constants/colors';
import { MAX_NICKNAME_LENGTH } from '@/constants/chat';
import { useTranslation } from '@/i18n';
import { haptics } from '@/utils/haptics';

interface NicknameSheetProps {
  visible: boolean;
  onClose: () => void;
  token: string | null;
  /** Re-mints an expired session token so a save can retry after a 401. */
  refreshToken: () => Promise<string | null>;
  initialNickname?: string;
  /** True when the handle is admin-assigned (locked); the editor is read-only. */
  locked?: boolean;
}

export function NicknameSheet({
  visible,
  onClose,
  token,
  refreshToken,
  initialNickname = '',
  locked = false,
}: NicknameSheetProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialNickname);
  const [saving, setSaving] = useState(false);

  // Re-sync the field to the caller's current handle each time the sheet opens
  // (the parent may have learned it after this component first mounted).
  useEffect(() => {
    if (visible) setValue(initialNickname);
  }, [visible, initialNickname]);

  const handleSave = async () => {
    if (!token) {
      onClose();
      return;
    }
    setSaving(true);
    const result = await runTokenAction(token, refreshToken, (tk) =>
      putChatNickname(tk, value.trim())
    );
    setSaving(false);
    if (!result || isError(result) || !result.data.success) {
      haptics.warning();
      // Map the server's status to a specific reason where we have one. A 403
      // is ambiguous (banned vs admin-locked handle): if this editor isn't
      // showing a locked handle, the address is banned.
      const status = result && isError(result) ? result.error.status : undefined;
      const text1 =
        status === 409
          ? t('chat.nicknameTaken')
          : status === 403
            ? locked
              ? t('chat.nicknameLocked')
              : t('chat.errors.banned')
            : t('chat.nicknameError');
      Toast.show({ type: 'error', text1 });
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
          {locked ? t('chat.nicknameLockedHint') : t('chat.nicknameHint')}
        </Text>
        <TextInput
          className="text-foreground border border-border px-3 py-2 mb-4"
          style={{ fontFamily: 'SpaceGrotesk_400Regular', opacity: locked ? 0.5 : 1 }}
          placeholder={t('chat.nicknamePlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={value}
          onChangeText={setValue}
          editable={!locked}
          maxLength={MAX_NICKNAME_LENGTH}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={handleSave}
        />
        {!locked ? (
          <Button onPress={handleSave} loading={saving} disabled={saving}>
            {t('common.save')}
          </Button>
        ) : null}
      </View>
    </Sheet>
  );
}
