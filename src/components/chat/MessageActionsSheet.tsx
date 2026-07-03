/**
 * Long-press actions for a chat message: a 2-line preview of the message, a
 * quick-react row (fixed emoji set, evenly spread), and actions — Copy for any
 * message, plus Report / Block for other people's messages.
 */

import { useRef } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';

import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { ReactionGlyph } from '@/components/chat/ReactionGlyph';
import { colors } from '@/constants/colors';
import { truncateAddress, formatTimestamp } from '@/utils/formatting';
import { haptics } from '@/utils/haptics';
import { useTranslation } from '@/i18n';
import {
  REACTION_EMOJIS,
  type ChatMessage,
  type ReactionEmoji,
} from '@/constants/chat';

interface MessageActionsSheetProps {
  message: ChatMessage | null;
  isOwn: boolean;
  onClose: () => void;
  onReply: (message: ChatMessage) => void;
  onReact: (id: string, emoji: ReactionEmoji, mine: boolean) => void;
  onReport: (message: ChatMessage) => void;
  onBlock: (message: ChatMessage) => void;
}

type IoniconsName = keyof typeof Ionicons.glyphMap;

export function MessageActionsSheet({
  message,
  isOwn,
  onClose,
  onReply,
  onReact,
  onReport,
  onBlock,
}: MessageActionsSheetProps) {
  const { t } = useTranslation();
  // Keep rendering the last message while `message` goes null so the Sheet can
  // play its slide-out animation instead of unmounting instantly.
  const lastMessageRef = useRef<ChatMessage | null>(null);
  if (message) lastMessageRef.current = message;
  const shown = message ?? lastMessageRef.current;
  if (!shown) return null;

  const sender = isOwn
    ? t('common.you')
    : shown.nickname || truncateAddress(shown.address);
  const mineFor = (emoji: ReactionEmoji): boolean =>
    !!shown.reactions?.find((r) => r.emoji === emoji)?.mine;

  const handleCopy = async () => {
    await Clipboard.setStringAsync(shown.body);
    haptics.success();
    Toast.show({ type: 'success', text1: t('chat.copied') });
    onClose();
  };

  return (
    <Sheet visible={!!message} onClose={onClose}>
      <View className="px-4 pt-2 pb-4">
        {/* Sender + timestamp */}
        <View className="flex-row items-center justify-between mb-2">
          <Text variant="caption" color="muted">
            {sender}
          </Text>
          <Text variant="caption" color="muted">
            {formatTimestamp(shown.ts)}
          </Text>
        </View>

        {/* Message preview (up to 2 lines) */}
        <View style={styles.preview}>
          <Text variant="body" numberOfLines={2} style={{ color: colors.textValue }}>
            {shown.body}
          </Text>
        </View>

        {/* Quick-react — icons fill the row, evenly sized/spread */}
        <View style={styles.reactRow}>
          {REACTION_EMOJIS.map((emoji) => {
            const mine = mineFor(emoji);
            return (
              <Pressable
                key={emoji}
                onPress={() => onReact(shown.id, emoji, mine)}
                accessibilityRole="button"
                style={[
                  styles.reactCell,
                  {
                    borderColor: mine ? colors.primary : colors.border,
                    backgroundColor: mine
                      ? colors.surfaceElevated
                      : colors.transparent,
                  },
                ]}
              >
                <ReactionGlyph
                  emoji={emoji}
                  size={22}
                  color={mine ? colors.text : colors.textMuted}
                />
              </Pressable>
            );
          })}
        </View>

        {/* Actions */}
        <ActionRow
          icon="arrow-undo-outline"
          label={t('chat.reply')}
          color={colors.textValue}
          onPress={() => onReply(shown)}
        />
        <ActionRow
          icon="copy-outline"
          label={t('chat.copy')}
          color={colors.textValue}
          onPress={handleCopy}
        />
        {!isOwn ? (
          <>
            <ActionRow
              icon="flag-outline"
              label={t('chat.report')}
              color={colors.warning}
              onPress={() => onReport(shown)}
            />
            <ActionRow
              icon="ban-outline"
              label={t('chat.block')}
              color={colors.danger}
              onPress={() => onBlock(shown)}
            />
          </>
        ) : null}
      </View>
    </Sheet>
  );
}

function ActionRow({
  icon,
  label,
  color,
  onPress,
}: {
  icon: IoniconsName;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={styles.actionRow}
    >
      <Ionicons name={icon} size={18} color={color} style={{ marginRight: 12 }} />
      <Text variant="body" style={{ color }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  preview: {
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    paddingLeft: 10,
    marginBottom: 16,
  },
  reactRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  reactCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderWidth: 1,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
