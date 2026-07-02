/**
 * Long-press actions for a chat message: a 2-line preview of the message, a
 * quick-react row (fixed emoji set, evenly spread), and actions — Copy for any
 * message, plus Report / Block for other people's messages.
 */

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
  onReact: (id: string, emoji: ReactionEmoji, mine: boolean) => void;
  onReport: (message: ChatMessage) => void;
  onBlock: (message: ChatMessage) => void;
}

type IoniconsName = keyof typeof Ionicons.glyphMap;

export function MessageActionsSheet({
  message,
  isOwn,
  onClose,
  onReact,
  onReport,
  onBlock,
}: MessageActionsSheetProps) {
  const { t } = useTranslation();
  if (!message) return null;

  const sender = isOwn
    ? t('common.you')
    : message.nickname || truncateAddress(message.address);
  const mineFor = (emoji: ReactionEmoji): boolean =>
    !!message.reactions?.find((r) => r.emoji === emoji)?.mine;

  const handleCopy = async () => {
    await Clipboard.setStringAsync(message.body);
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
            {formatTimestamp(message.ts)}
          </Text>
        </View>

        {/* Message preview (up to 2 lines) */}
        <View style={styles.preview}>
          <Text variant="body" numberOfLines={2} style={{ color: colors.textValue }}>
            {message.body}
          </Text>
        </View>

        {/* Quick-react — icons fill the row, evenly sized/spread */}
        <View style={styles.reactRow}>
          {REACTION_EMOJIS.map((emoji) => {
            const mine = mineFor(emoji);
            return (
              <Pressable
                key={emoji}
                onPress={() => onReact(message.id, emoji, mine)}
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
              onPress={() => onReport(message)}
            />
            <ActionRow
              icon="ban-outline"
              label={t('chat.block')}
              color={colors.danger}
              onPress={() => onBlock(message)}
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
