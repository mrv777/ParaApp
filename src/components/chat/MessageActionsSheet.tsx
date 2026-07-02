/**
 * Long-press actions for a chat message: quick-react over the fixed emoji set,
 * plus Report / Block for other people's messages.
 */

import { View, Pressable } from 'react-native';

import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { colors } from '@/constants/colors';
import { truncateAddress } from '@/utils/formatting';
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

  const sender = message.nickname || truncateAddress(message.address);
  const mineFor = (emoji: ReactionEmoji): boolean =>
    !!message.reactions?.find((r) => r.emoji === emoji)?.mine;

  return (
    <Sheet visible={!!message} onClose={onClose}>
      <View className="px-4 pt-2 pb-4">
        <Text variant="caption" color="muted" className="mb-3 font-mono">
          {sender}
        </Text>

        {/* Quick-react */}
        <View className="flex-row mb-4">
          {REACTION_EMOJIS.map((emoji) => (
            <Pressable
              key={emoji}
              onPress={() => onReact(message.id, emoji, mineFor(emoji))}
              accessibilityRole="button"
              className="mr-2 px-3 py-2 border"
              style={{
                borderColor: mineFor(emoji) ? colors.text : colors.border,
                backgroundColor: mineFor(emoji)
                  ? colors.surfaceElevated
                  : 'transparent',
              }}
            >
              <Text variant="body">{emoji}</Text>
            </Pressable>
          ))}
        </View>

        {/* Report / Block — only for other people's messages */}
        {!isOwn ? (
          <View>
            <Pressable
              onPress={() => onReport(message)}
              accessibilityRole="button"
              className="py-3 border-t border-border"
            >
              <Text variant="body" color="warning">
                {t('chat.report')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onBlock(message)}
              accessibilityRole="button"
              className="py-3 border-t border-border"
            >
              <Text variant="body" color="danger">
                {t('chat.block')}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}
