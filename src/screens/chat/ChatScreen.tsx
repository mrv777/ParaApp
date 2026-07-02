/**
 * ChatScreen — the global community room. Inverted FlatList of messages, a
 * presence/connection header, and an activity-gated composer. Read-only when no
 * address is set. Reactions + report/block land in later phases.
 */

import { memo, useCallback, useEffect, useState } from 'react';
import {
  View,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  type ListRenderItem,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

import { Text } from '@/components/Text';
import { NicknameSheet } from '@/components/chat/NicknameSheet';
import { MessageActionsSheet } from '@/components/chat/MessageActionsSheet';
import { EulaSheet } from '@/components/chat/EulaSheet';
import { useChatSocket } from '@/hooks/useChatSocket';
import {
  reportChatMessage,
  blockChatAddress,
  acceptChatEula,
} from '@/api/chat';
import {
  useChatStore,
  selectChatMessages,
  selectChatOnline,
  selectChatConnectionState,
  type ChatConnectionState,
} from '@/store/chatStore';
import {
  useSettingsStore,
  selectBitcoinAddress,
  selectHasAddress,
  selectChatEulaVersion,
} from '@/store/settingsStore';
import { colors } from '@/constants/colors';
import { truncateAddress } from '@/utils/formatting';
import { haptics } from '@/utils/haptics';
import { useTranslation } from '@/i18n';
import {
  MAX_MESSAGE_LENGTH,
  CHAT_EULA_VERSION,
  type ChatMessage,
  type ReactionEmoji,
} from '@/constants/chat';
import type { MainTabScreenProps } from '@/types/navigation';

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

const CONNECTION_DOT: Record<ChatConnectionState, string> = {
  connected: colors.success,
  connecting: colors.warning,
  disconnected: colors.danger,
};

interface BubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  youLabel: string;
  canReact: boolean;
  onLongPress: (message: ChatMessage) => void;
  onToggleReaction: (id: string, emoji: ReactionEmoji, mine: boolean) => void;
}

const MessageBubble = memo(function MessageBubble({
  message,
  isOwn,
  youLabel,
  canReact,
  onLongPress,
  onToggleReaction,
}: BubbleProps) {
  const sender = isOwn
    ? youLabel
    : message.nickname || truncateAddress(message.address);
  return (
    <Pressable
      onLongPress={() => canReact && onLongPress(message)}
      delayLongPress={300}
    >
      <View className="px-4 py-2">
        <View className="flex-row items-baseline justify-between mb-0.5">
          <Text
            variant="caption"
            className="font-mono"
            color={isOwn ? 'default' : 'muted'}
          >
            {sender}
          </Text>
          <Text variant="caption" color="muted">
            {formatTime(message.ts)}
          </Text>
        </View>
        <Text variant="body" color="default">
          {message.body}
        </Text>

        {/* Reaction chips (tap to toggle). */}
        {message.reactions && message.reactions.length > 0 ? (
          <View className="flex-row flex-wrap mt-1.5">
            {message.reactions.map((r) => (
              <Pressable
                key={r.emoji}
                onPress={() =>
                  canReact && onToggleReaction(message.id, r.emoji, !!r.mine)
                }
                className="flex-row items-center mr-2 mt-1 px-2 py-0.5 border"
                style={{
                  borderColor: r.mine ? colors.text : colors.border,
                  backgroundColor: r.mine ? colors.surfaceElevated : 'transparent',
                }}
              >
                <Text variant="caption" color="default">{`${r.emoji} ${r.count}`}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

type Props = MainTabScreenProps<'Chat'>;

export function ChatScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const {
    sendMessage,
    sendReaction,
    canPost,
    token,
    gateDenied,
    lastError,
    clearError,
    reconnect,
  } = useChatSocket();

  const messages = useChatStore(selectChatMessages);
  const online = useChatStore(selectChatOnline);
  const connectionState = useChatStore(selectChatConnectionState);
  const removeMessagesFrom = useChatStore((s) => s.removeMessagesFrom);

  const address = useSettingsStore(selectBitcoinAddress);
  const hasAddress = useSettingsStore(selectHasAddress);
  const eulaVersion = useSettingsStore(selectChatEulaVersion);
  const setChatEulaVersion = useSettingsStore((s) => s.setChatEulaVersion);

  const [input, setInput] = useState('');
  const [actionMessage, setActionMessage] = useState<ChatMessage | null>(null);
  const [nicknameOpen, setNicknameOpen] = useState(false);
  const [eulaOpen, setEulaOpen] = useState(false);
  const [pendingSend, setPendingSend] = useState<string | null>(null);

  // Surface server errors (rate limited, blocked, etc.) as a toast.
  useEffect(() => {
    if (!lastError) return;
    haptics.warning();
    Toast.show({
      type: 'error',
      text1: t(`chat.errors.${lastError}`, {
        defaultValue: t('chat.errors.generic'),
      }),
    });
    clearError();
  }, [lastError, t, clearError]);

  const doSend = useCallback(
    (body: string) => {
      if (sendMessage(body)) {
        setInput('');
        haptics.light();
      } else {
        haptics.warning();
      }
    },
    [sendMessage]
  );

  const handleSend = useCallback(() => {
    const body = input.trim();
    if (!body) return;
    // First post requires accepting the current community guidelines / EULA.
    if (eulaVersion !== CHAT_EULA_VERSION) {
      setPendingSend(body);
      setEulaOpen(true);
      return;
    }
    doSend(body);
  }, [input, eulaVersion, doSend]);

  const handleAcceptEula = useCallback(() => {
    setChatEulaVersion(CHAT_EULA_VERSION);
    if (token) void acceptChatEula(token, CHAT_EULA_VERSION);
    setEulaOpen(false);
    const body = pendingSend;
    setPendingSend(null);
    if (body) doSend(body);
  }, [setChatEulaVersion, token, pendingSend, doSend]);

  const handleLongPress = useCallback((message: ChatMessage) => {
    haptics.medium();
    setActionMessage(message);
  }, []);

  const handleToggleReaction = useCallback(
    (id: string, emoji: ReactionEmoji, mine: boolean) => {
      const ok = sendReaction(id, emoji, mine ? 'remove' : 'add');
      if (ok) haptics.selection();
      else haptics.warning();
      setActionMessage(null);
    },
    [sendReaction]
  );

  const handleReport = useCallback(
    (message: ChatMessage) => {
      setActionMessage(null);
      if (!token) return;
      void reportChatMessage(token, message.id, '');
      haptics.success();
      Toast.show({ type: 'success', text1: t('chat.reported') });
    },
    [token, t]
  );

  const handleBlock = useCallback(
    (message: ChatMessage) => {
      setActionMessage(null);
      if (!token) return;
      void blockChatAddress(token, message.address);
      removeMessagesFrom(message.address); // optimistic
      reconnect(); // reload the DO block list so live delivery is filtered too
      haptics.success();
      Toast.show({ type: 'success', text1: t('chat.blocked') });
    },
    [token, removeMessagesFrom, reconnect, t]
  );

  const renderItem = useCallback<ListRenderItem<ChatMessage>>(
    ({ item }) => (
      <MessageBubble
        message={item}
        isOwn={!!address && item.address === address}
        youLabel={t('common.you')}
        canReact={canPost}
        onLongPress={handleLongPress}
        onToggleReaction={handleToggleReaction}
      />
    ),
    [address, t, canPost, handleLongPress, handleToggleReaction]
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
        <Text variant="subtitle">{t('chat.title')}</Text>
        <View className="flex-row items-center">
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: CONNECTION_DOT[connectionState],
              marginRight: 6,
            }}
          />
          <Text variant="caption" color="muted">
            {connectionState === 'connected'
              ? t('chat.online', { count: online })
              : connectionState === 'connecting'
                ? t('chat.connecting')
                : t('chat.disconnected')}
          </Text>
          {canPost ? (
            <Pressable
              onPress={() => setNicknameOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t('chat.nickname')}
              className="ml-3 p-1"
            >
              <Ionicons
                name="person-circle-outline"
                size={22}
                color={colors.textMuted}
              />
            </Pressable>
          ) : null}
        </View>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          data={messages}
          inverted
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          extraData={canPost}
          contentContainerStyle={
            messages.length === 0
              ? { flex: 1, justifyContent: 'center' }
              : { paddingVertical: 8 }
          }
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
          ListEmptyComponent={
            // Counter-flip: `inverted` mirrors the list, which would otherwise
            // render the empty state upside-down.
            <View style={{ transform: [{ scaleY: -1 }] }}>
              <Text variant="body" color="muted" align="center">
                {t('chat.empty')}
              </Text>
            </View>
          }
        />

        {/* Composer, or a read-only bar explaining why posting is unavailable. */}
        {canPost ? (
          <View className="flex-row items-end px-3 py-2 border-t border-border">
            <TextInput
              className="flex-1 text-foreground px-3 py-2"
              style={{ fontFamily: 'SpaceGrotesk_400Regular', maxHeight: 120 }}
              placeholder={t('chat.composerPlaceholder')}
              placeholderTextColor={colors.textMuted}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={MAX_MESSAGE_LENGTH}
              onSubmitEditing={handleSend}
              blurOnSubmit={false}
              returnKeyType="send"
            />
            <Pressable
              onPress={handleSend}
              disabled={input.trim().length === 0}
              accessibilityRole="button"
              accessibilityLabel={t('chat.send')}
              className="items-center justify-center p-2"
            >
              <Ionicons
                name="send"
                size={22}
                color={input.trim().length > 0 ? colors.text : colors.textDisabled}
              />
            </Pressable>
          </View>
        ) : !hasAddress ? (
          // No address → prompt to add one.
          <View className="flex-row items-center justify-between px-4 py-3 border-t border-border">
            <View className="flex-row items-center flex-1 mr-3">
              <Ionicons
                name="lock-closed-outline"
                size={16}
                color={colors.textMuted}
                style={{ marginRight: 8 }}
              />
              <Text variant="caption" color="muted" className="flex-1">
                {t('chat.composerReadOnly')}
              </Text>
            </View>
            <Pressable
              onPress={() => navigation.navigate('Settings')}
              accessibilityRole="button"
              className="px-3 py-2 border border-border"
            >
              <Text variant="caption" color="default">
                {t('chat.addAddress')}
              </Text>
            </Pressable>
          </View>
        ) : (
          // Address set but not (yet) eligible: gate denied vs still verifying.
          <View className="flex-row items-center px-4 py-3 border-t border-border">
            <Ionicons
              name={gateDenied ? 'lock-closed-outline' : 'ellipsis-horizontal'}
              size={16}
              color={colors.textMuted}
              style={{ marginRight: 8 }}
            />
            <Text variant="caption" color="muted" className="flex-1">
              {gateDenied
                ? t('chat.postingLocked')
                : t('chat.composerVerifying')}
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>

      <NicknameSheet
        visible={nicknameOpen}
        onClose={() => setNicknameOpen(false)}
        token={token}
      />

      <MessageActionsSheet
        message={actionMessage}
        isOwn={!!address && actionMessage?.address === address}
        onClose={() => setActionMessage(null)}
        onReact={handleToggleReaction}
        onReport={handleReport}
        onBlock={handleBlock}
      />

      <EulaSheet
        visible={eulaOpen}
        onAccept={handleAcceptEula}
        onClose={() => {
          setEulaOpen(false);
          setPendingSend(null);
        }}
      />
    </SafeAreaView>
  );
}
