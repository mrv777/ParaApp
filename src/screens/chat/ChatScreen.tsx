/**
 * ChatScreen — the global community room, styled to the hi-fi Chat handoff.
 *
 * Layout (top → bottom): header (title + presence + account), a pinned
 * announcement strip, a bottom-anchored inverted feed, and an activity-gated
 * composer. Terminal/brutalist aesthetic: sharp corners, hairlines, Space
 * Grotesk for prose and JetBrains Mono (the app's mono, in place of the
 * handoff's Space Mono) for addresses/labels/timestamps.
 *
 * Data is real (WebSocket + chatStore); only the presentation follows the
 * design. Reply-quotes are rendered when present but the backend does not carry
 * a parent reference yet, so `replyTo` is currently never populated.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text as RNText,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

import { NicknameSheet } from '@/components/chat/NicknameSheet';
import { MessageActionsSheet } from '@/components/chat/MessageActionsSheet';
import { EulaSheet } from '@/components/chat/EulaSheet';
import { useChatSocket } from '@/hooks/useChatSocket';
import {
  reportChatMessage,
  blockChatSender,
  acceptChatEula,
  runTokenAction,
} from '@/api/chat';
import { isError } from '@/api/client';
import type { ApiResult } from '@/types';
import {
  useChatStore,
  selectChatMessages,
  selectChatOnline,
  selectChatConnectionState,
  selectChatAnnouncement,
  selectChatHistoryLoaded,
  type ChatConnectionState,
} from '@/store/chatStore';
import {
  useSettingsStore,
  selectBitcoinAddress,
  selectHasAddress,
  selectChatEulaVersion,
} from '@/store/settingsStore';
import { colors } from '@/constants/colors';
import { truncateAddress, formatDateDivider, isSameLocalDay } from '@/utils/formatting';
import { sanitizeDisplayBody } from '@/utils/messageText';
import { haptics } from '@/utils/haptics';
import { glyphCells } from '@/utils/identicon';
import { ReactionGlyph } from '@/components/chat/ReactionGlyph';
import { SkeletonLoader } from '@/components/SkeletonLoader';
import { useTranslation } from '@/i18n';
import {
  MAX_MESSAGE_LENGTH,
  CHAT_EULA_VERSION,
  truncateChatAddress,
  type ChatMessage,
  type ReactionEmoji,
} from '@/constants/chat';
import type { MainTabScreenProps } from '@/types/navigation';

const MIN_INPUT_HEIGHT = 22;
const MAX_INPUT_HEIGHT = 110;

// Weighted font families the app ships (RN doesn't synthesize weights). Space
// Grotesk = prose/titles; JetBrains Mono = addresses/labels/timestamps.
const MONO = 'JetBrainsMono_400Regular';
const MONO_BOLD = 'JetBrainsMono_700Bold';
const GROTESK = 'SpaceGrotesk_400Regular';
const GROTESK_BOLD = 'SpaceGrotesk_700Bold';

// Design tokens local to this screen (hairlines/text ramp beyond colors.ts).
const HAIRLINE = 'rgba(255,255,255,0.055)'; // row separators
const EDGE = 'rgba(255,255,255,0.1)'; // composer / header divider
const PIN_BORDER = 'rgba(255,255,255,0.14)';
const PIN_BG = 'rgba(255,255,255,0.03)';
const IDENTICON_BORDER = 'rgba(255,255,255,0.16)';
const REPLY_BAR = 'rgba(255,255,255,0.14)';
// Brief flash when a reply-quote jump lands on the original message.
const HIGHLIGHT_BG = 'rgba(255,255,255,0.06)';

const TEXT_BODY = '#f2f2f3';
const TEXT_PINNED = '#e0e0e2';
const TEXT_MUTED = '#8a8a8d';
const TEXT_REPLY_HANDLE = '#6a6a6c';
const TEXT_TIME = '#5a5a5c';
const TEXT_REPLY_PREVIEW = '#7a7a7d';
const CHIP_BG = '#f4f4f5';

// App language, not device locale — keeps times consistent with the day
// dividers, which already format via i18n.language.
function formatTime(ts: number, locale: string): string {
  return new Date(ts).toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

const CONNECTION_DOT: Record<ChatConnectionState, string> = {
  connected: colors.success,
  connecting: colors.warning,
  disconnected: colors.danger,
};

/** Deterministic 5×5 block-glyph avatar derived from the sender's address. */
const Identicon = memo(function Identicon({ address, self }: { address: string; self: boolean }) {
  const cells = useMemo(() => glyphCells(address, self), [address, self]);
  return (
    <View style={styles.identicon}>
      {cells.map((bg, i) => (
        <View
          key={i}
          style={{ width: '20%', height: '20%', backgroundColor: bg ?? 'transparent' }}
        />
      ))}
    </View>
  );
});

interface RowProps {
  message: ChatMessage;
  isOwn: boolean;
  youLabel: string;
  canReact: boolean;
  /** Day-divider label to show above this row (first message of a new day), else null. */
  dateLabel: string | null;
  /** Localized fallback shown in the quote when a reply's parent is unavailable. */
  replyUnavailableLabel: string;
  /** True while this row is briefly highlighted after a jump-to-original. */
  highlighted: boolean;
  onLongPress: (message: ChatMessage) => void;
  onReply: (message: ChatMessage) => void;
  onJumpTo: (id: string | undefined) => void;
  onToggleReaction: (id: string, emoji: ReactionEmoji, mine: boolean) => void;
}

const MessageRow = memo(function MessageRow({
  message,
  isOwn,
  youLabel,
  canReact,
  dateLabel,
  replyUnavailableLabel,
  highlighted,
  onLongPress,
  onReply,
  onJumpTo,
  onToggleReaction,
}: RowProps) {
  const { i18n } = useTranslation();
  const handle = isOwn ? youLabel : message.nickname || truncateAddress(message.address);
  const body = useMemo(() => sanitizeDisplayBody(message.body), [message.body]);
  const swipeRef = useRef<Swipeable>(null);

  // Swiped far enough → set this message as the reply target, then snap back
  // (reply-and-reset; no persistent open state to manage).
  const handleSwipeOpen = useCallback(() => {
    onReply(message);
    swipeRef.current?.close();
  }, [onReply, message]);

  const renderReplyAction = useCallback(
    () => (
      <View style={styles.swipeAction}>
        <RNText style={styles.swipeGlyph}>↩</RNText>
      </View>
    ),
    []
  );

  return (
    <>
      {/* Day divider — first message of each local day. Outside the row so a
          long-press / swipe here doesn't act on the message. */}
      {dateLabel ? (
        <View style={styles.dayDivider}>
          <View style={styles.dayRule} />
          <RNText style={styles.dayLabel}>{dateLabel}</RNText>
          <View style={styles.dayRule} />
        </View>
      ) : null}

      <Swipeable
        ref={swipeRef}
        enabled={canReact}
        renderRightActions={canReact ? renderReplyAction : undefined}
        rightThreshold={40}
        friction={2}
        onSwipeableOpen={handleSwipeOpen}
      >
        <Pressable
          onLongPress={() => canReact && onLongPress(message)}
          delayLongPress={300}
          style={[styles.row, highlighted && styles.rowHighlight]}
        >
          {/* Meta line: identicon · handle · spacer · timestamp */}
          <View style={styles.meta}>
            <Identicon address={message.address} self={isOwn} />
            {isOwn ? (
              <RNText style={styles.handleSelf}>{handle}</RNText>
            ) : (
              <RNText style={styles.handle}>{handle}</RNText>
            )}
            {/* Admin-assigned (locked) official handle. */}
            {message.official ? (
              <RNText style={styles.official} accessibilityLabel="Official handle">
                ✓
              </RNText>
            ) : null}
            <View style={{ flex: 1 }} />
            <RNText style={styles.time}>{formatTime(message.ts, i18n.language)}</RNText>
          </View>

          {/* Reply quote (any message that references a parent). Tapping jumps to
              the original. When the quote itself is absent — parent deleted,
              pruned, or from a blocked sender — show a muted placeholder. */}
          {message.replyToId ? (
            <Pressable
              onPress={() => onJumpTo(message.replyToId)}
              style={styles.replyQuote}
            >
              <RNText style={styles.replyHandle}>
                {`↩ ${message.replyTo?.senderDisplay ?? ''}`}
              </RNText>
              <RNText
                style={[
                  styles.replyPreview,
                  !message.replyTo && styles.replyPreviewMuted,
                ]}
                numberOfLines={1}
              >
                {message.replyTo?.textPreview ?? replyUnavailableLabel}
              </RNText>
            </Pressable>
          ) : null}

          {/* Body */}
          <RNText style={styles.body}>{body}</RNText>

          {/* Reaction chips (tap to toggle). */}
          {message.reactions && message.reactions.length > 0 ? (
            <View style={styles.reactions}>
              {message.reactions.map((r) => (
                <Pressable
                  key={r.emoji}
                  onPress={() => canReact && onToggleReaction(message.id, r.emoji, !!r.mine)}
                  style={[styles.chip, { borderColor: r.mine ? colors.primary : colors.border }]}
                >
                  {/* Monochrome vector icon (color emoji don't render reliably and
                    clash with the theme); count stays mono. */}
                  <ReactionGlyph emoji={r.emoji} size={13} color={TEXT_BODY} />
                  <RNText style={styles.chipCount}>{` ${r.count}`}</RNText>
                </Pressable>
              ))}
            </View>
          ) : null}
        </Pressable>
      </Swipeable>
    </>
  );
});

const Separator = () => <View style={styles.separator} />;

// Rendered when the feed has no messages (fresh room / fresh identity).
const EmptyFeed = ({ title, hint }: { title: string; hint: string }) => (
  <View style={styles.emptyWrap}>
    <RNText style={styles.emptyTitle}>{title}</RNText>
    <RNText style={styles.emptyHint}>{hint}</RNText>
  </View>
);

// Placeholder rows shown while the first history backfill is in flight, so a
// still-loading room isn't mistaken for an empty one. Widths vary per row to
// read as natural chat lines; matches the row padding of a real message.
const SKELETON_ROWS: { nick: number; body: number }[] = [
  { nick: 74, body: 168 },
  { nick: 92, body: 224 },
  { nick: 60, body: 132 },
  { nick: 108, body: 196 },
  { nick: 80, body: 248 },
  { nick: 66, body: 150 },
];

const ChatFeedSkeleton = () => (
  <View style={styles.skeletonWrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {SKELETON_ROWS.map((r, i) => (
      <View key={i} style={styles.skeletonRow}>
        <SkeletonLoader variant="text" width={r.nick} height={11} />
        <SkeletonLoader variant="text" width={r.body} height={14} />
      </View>
    ))}
  </View>
);

// Shown at the top of the feed while an older page is being fetched.
const LoadingOlder = () => (
  <View style={styles.loadingOlder}>
    <ActivityIndicator size="small" color={TEXT_MUTED} />
  </View>
);

/** True when a REST action resolved to a successful `{success:true}` body. */
function actionSucceeded(
  res: ApiResult<{ success: boolean }> | null
): boolean {
  return !!res && !isError(res) && res.data.success;
}

type Props = MainTabScreenProps<'Chat'>;

export function ChatScreen({ navigation }: Props) {
  const { t, i18n } = useTranslation();
  const {
    sendMessage,
    sendReaction,
    canPost,
    token,
    selfNickname,
    selfOfficial,
    gateDenied,
    lastError,
    clearError,
    reconnect,
    refreshToken,
    refresh,
    loadOlder,
    loadingOlder,
  } = useChatSocket();

  // Reconcile history whenever the Chat tab regains focus. The screen stays
  // mounted across tab switches (so the socket persists but backfill wouldn't
  // re-run), and non-broadcast changes — admin edits, or anything missed during
  // a hiccup — only surface on a fresh fetch.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const messages = useChatStore(selectChatMessages);

  // Day dividers: a message gets a label only when it's the first of its local
  // day (vs the previous, older message). Precomputed as id → label so the row
  // renderer stays a cheap lookup and `data` remains pure messages (keeps
  // pagination / reactions / scroll-anchoring untouched). O(n), n ≤ MAX_MESSAGES.
  const dividerById = useMemo(() => {
    const map = new Map<string, string>();
    const today = t('chat.dateToday');
    const yesterday = t('chat.dateYesterday');
    for (let i = 0; i < messages.length; i++) {
      const cur = messages[i];
      const prev = messages[i - 1];
      if (!prev || !isSameLocalDay(prev.ts, cur.ts)) {
        map.set(cur.id, formatDateDivider(cur.ts, today, yesterday, i18n.language));
      }
    }
    return map;
  }, [messages, t, i18n.language]);

  const online = useChatStore(selectChatOnline);
  const connectionState = useChatStore(selectChatConnectionState);
  const historyLoaded = useChatStore(selectChatHistoryLoaded);
  const announcement = useChatStore(selectChatAnnouncement);
  const removeMessagesFrom = useChatStore((s) => s.removeMessagesFrom);
  const applyReaction = useChatStore((s) => s.applyReaction);
  const markSeen = useChatStore((s) => s.markSeen);

  // Keep the tab-bar unread dot cleared while the user is actually looking at
  // the feed; messages that land while another tab is focused stay unread.
  const isFocused = useIsFocused();
  useEffect(() => {
    if (isFocused) markSeen();
  }, [isFocused, messages, markSeen]);

  const address = useSettingsStore(selectBitcoinAddress);
  // Server payloads carry only truncated sender keys, so "is this mine?"
  // compares against the truncated form of our own address.
  const selfKey = address ? truncateChatAddress(address) : null;
  const hasAddress = useSettingsStore(selectHasAddress);
  const eulaVersion = useSettingsStore(selectChatEulaVersion);
  const setChatEulaVersion = useSettingsStore((s) => s.setChatEulaVersion);

  const [input, setInput] = useState('');
  const [inputHeight, setInputHeight] = useState(MIN_INPUT_HEIGHT);
  const [actionMessage, setActionMessage] = useState<ChatMessage | null>(null);
  // The message currently being replied to (composer banner + outgoing replyToId).
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  // Row briefly flashed after a jump-to-original from a reply quote.
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<React.ComponentRef<typeof LegendList>>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The long-press snapshot goes stale if a reaction lands while the sheet is
  // open (its quick-react `mine` state would send the wrong op) — resolve the
  // live copy from the store; fall back to the snapshot if it was deleted.
  const liveActionMessage = useMemo(() => {
    if (!actionMessage) return null;
    return messages.find((m) => m.id === actionMessage.id) ?? actionMessage;
  }, [actionMessage, messages]);
  const [nicknameOpen, setNicknameOpen] = useState(false);
  const [eulaOpen, setEulaOpen] = useState(false);
  // Body + reply target held across the first-post EULA gate.
  const [pendingSend, setPendingSend] = useState<{
    body: string;
    replyTo: ChatMessage | null;
  } | null>(null);

  const hasDraft = input.trim().length > 0;

  // Last body handed to the socket. The input clears as soon as ws.send()
  // succeeds, but the server may still reject it (rate limit, filter) via a
  // later `error` event — restore the text then so the user's draft isn't lost.
  const lastSentRef = useRef<string | null>(null);
  // The reply target that accompanied lastSentRef, restored alongside the text
  // if the send is rejected, so a bounced reply keeps its context.
  const lastReplyRef = useRef<ChatMessage | null>(null);

  // Surface server errors (rate limited, blocked, etc.) as a toast.
  useEffect(() => {
    if (!lastError) return;
    if (
      (lastError === 'rate_limited' ||
        lastError === 'blocked_content' ||
        lastError === 'bad_body') &&
      lastSentRef.current
    ) {
      const rejected = lastSentRef.current;
      const rejectedReply = lastReplyRef.current;
      lastSentRef.current = null;
      lastReplyRef.current = null;
      // Don't clobber anything the user has typed / a reply they've since started.
      setInput((current) => (current.trim() ? current : rejected));
      setReplyTarget((current) => current ?? rejectedReply);
    }
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
    (body: string, replyTo: ChatMessage | null) => {
      if (sendMessage(body, replyTo?.id)) {
        lastSentRef.current = body;
        lastReplyRef.current = replyTo;
        setInput('');
        setReplyTarget(null); // consumed — clear the composer banner
        setInputHeight(MIN_INPUT_HEIGHT); // shrink back after sending
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
      setPendingSend({ body, replyTo: replyTarget });
      setEulaOpen(true);
      return;
    }
    doSend(body, replyTarget);
  }, [input, eulaVersion, doSend, replyTarget]);

  const handleAcceptEula = useCallback(() => {
    // Set the local version + send immediately so the first post isn't gated on a
    // network round-trip. Record acceptance server-side in the background, with a
    // token refresh on 401; surface a toast only if it ultimately fails so a
    // missing compliance record is visible rather than silently dropped.
    setChatEulaVersion(CHAT_EULA_VERSION);
    setEulaOpen(false);
    const pending = pendingSend;
    setPendingSend(null);
    if (pending) doSend(pending.body, pending.replyTo);
    if (token) {
      void runTokenAction(token, refreshToken, (tk) =>
        acceptChatEula(tk, CHAT_EULA_VERSION)
      ).then((res) => {
        if (!actionSucceeded(res)) {
          Toast.show({ type: 'error', text1: t('chat.actionFailed') });
        }
      });
    }
  }, [setChatEulaVersion, token, refreshToken, pendingSend, doSend, t]);

  // Account icon: edit nickname when eligible, else route to add an address.
  const handleAccountPress = useCallback(() => {
    if (canPost) setNicknameOpen(true);
    else navigation.navigate('Settings');
  }, [canPost, navigation]);

  const handleLongPress = useCallback((message: ChatMessage) => {
    haptics.medium();
    setActionMessage(message);
  }, []);

  // Start a reply: set the target, close any open action sheet, and focus the
  // composer so the keyboard is up ready to type.
  const handleReply = useCallback((message: ChatMessage) => {
    setActionMessage(null);
    setReplyTarget(message);
    haptics.selection();
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // Jump from a reply quote to the original message, if it's in the loaded
  // buffer; briefly highlight it. Older-than-buffer parents can't be targeted.
  const handleJumpTo = useCallback(
    (id: string | undefined) => {
      if (!id) return;
      const idx = messages.findIndex((m) => m.id === id);
      if (idx === -1) {
        haptics.warning();
        Toast.show({ type: 'info', text1: t('chat.replyNotLoaded') });
        return;
      }
      listRef.current?.scrollToIndex?.({
        index: idx,
        animated: true,
        viewPosition: 0.5,
      });
      setHighlightedId(id);
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => setHighlightedId(null), 1400);
      haptics.selection();
    },
    [messages, t]
  );

  // Clear a pending highlight timer on unmount.
  useEffect(() => {
    return () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    };
  }, []);

  const handleToggleReaction = useCallback(
    (id: string, emoji: ReactionEmoji, mine: boolean) => {
      // A reaction shares the `rate_limited` error code with messages, and the
      // error effect restores lastSentRef into the composer. Clear it here so a
      // rate-limited reaction can't resurrect a long-delivered message / reply.
      lastSentRef.current = null;
      lastReplyRef.current = null;
      const ok = sendReaction(id, emoji, mine ? 'remove' : 'add');
      if (ok) {
        // Optimistic local update: the server echoes reactions only as a
        // coalesced, count-only broadcast (no per-actor `mine`), so own
        // feedback must be applied here. The authoritative flushed count
        // reconciles any drift a moment later.
        const msg = useChatStore.getState().messages.find((m) => m.id === id);
        const current =
          msg?.reactions?.find((r) => r.emoji === emoji)?.count ?? 0;
        applyReaction(id, emoji, Math.max(0, current + (mine ? -1 : 1)), !mine);
        haptics.selection();
      } else {
        haptics.warning();
      }
      setActionMessage(null);
    },
    [sendReaction, applyReaction]
  );

  const handleReport = useCallback(
    async (message: ChatMessage) => {
      setActionMessage(null);
      if (!token) return;
      const res = await runTokenAction(token, refreshToken, (tk) =>
        reportChatMessage(tk, message.id, '')
      );
      if (actionSucceeded(res)) {
        haptics.success();
        Toast.show({ type: 'success', text1: t('chat.reported') });
      } else {
        haptics.warning();
        Toast.show({ type: 'error', text1: t('chat.reportFailed') });
      }
    },
    [token, refreshToken, t]
  );

  const handleBlock = useCallback(
    async (message: ChatMessage) => {
      setActionMessage(null);
      if (!token) return;
      const res = await runTokenAction(token, refreshToken, (tk) =>
        blockChatSender(tk, message.id)
      );
      if (actionSucceeded(res)) {
        // Only prune + reload the DO block list once the server confirms — so the
        // UI never implies a block that didn't actually take.
        removeMessagesFrom(message.address);
        reconnect();
        haptics.success();
        Toast.show({ type: 'success', text1: t('chat.blocked') });
      } else {
        haptics.warning();
        Toast.show({ type: 'error', text1: t('chat.blockFailed') });
      }
    },
    [token, refreshToken, removeMessagesFrom, reconnect, t]
  );

  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<ChatMessage>) => (
      <MessageRow
        message={item}
        isOwn={!!selfKey && item.address === selfKey}
        youLabel={t('common.you')}
        canReact={canPost}
        dateLabel={dividerById.get(item.id) ?? null}
        replyUnavailableLabel={t('chat.replyUnavailable')}
        highlighted={highlightedId === item.id}
        onLongPress={handleLongPress}
        onReply={handleReply}
        onJumpTo={handleJumpTo}
        onToggleReaction={handleToggleReaction}
      />
    ),
    [
      selfKey,
      t,
      canPost,
      dividerById,
      highlightedId,
      handleLongPress,
      handleReply,
      handleJumpTo,
      handleToggleReaction,
    ]
  );

  // Composer reply-banner display values.
  const replySenderDisplay = replyTarget
    ? !!selfKey && replyTarget.address === selfKey
      ? t('common.you')
      : replyTarget.nickname || truncateAddress(replyTarget.address)
    : '';
  const replyPreviewText = replyTarget ? sanitizeDisplayBody(replyTarget.body) : '';

  const online_ =
    connectionState === 'connected'
      ? t('chat.online', { count: online })
      : connectionState === 'connecting'
        ? t('chat.connecting')
        : t('chat.disconnected');

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <RNText style={styles.title}>{t('chat.title')}</RNText>
        <View style={styles.headerRight}>
          <View style={styles.online}>
            <View style={[styles.dot, { backgroundColor: CONNECTION_DOT[connectionState] }]} />
            <RNText style={styles.onlineText}>{online_}</RNText>
          </View>
          <Pressable
            onPress={handleAccountPress}
            accessibilityRole="button"
            accessibilityLabel={t('chat.nickname')}
            hitSlop={8}
          >
            <Ionicons name="person-circle-outline" size={24} color={TEXT_MUTED} />
          </Pressable>
        </View>
      </View>

      {/* Pinned announcement (admin) — just pin + message; hidden when none. */}
      {announcement ? (
        <View style={styles.pinned}>
          <MaterialCommunityIcons
            name="pin"
            size={15}
            color={TEXT_MUTED}
            style={{ marginTop: 1 }}
          />
          <RNText style={styles.pinnedBody}>{sanitizeDisplayBody(announcement)}</RNText>
        </View>
      ) : null}

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Bottom-anchored feed (newest at the bottom via alignItemsAtEnd).
            Scroll to the top pages older history; maintainVisibleContentPosition
            keeps the viewport steady as older messages prepend. */}
        <LegendList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          extraData={canPost}
          recycleItems
          ItemSeparatorComponent={Separator}
          contentContainerStyle={styles.feedContent}
          style={styles.feed}
          alignItemsAtEnd
          initialScrollAtEnd
          maintainScrollAtEnd
          maintainScrollAtEndThreshold={0.1}
          maintainVisibleContentPosition={{ size: true, data: true }}
          onStartReached={loadOlder}
          onStartReachedThreshold={0.2}
          ListHeaderComponent={loadingOlder ? <LoadingOlder /> : null}
          ListEmptyComponent={
            // Skeleton while the first backfill runs (connecting or connected);
            // the real "say hi" empty state only once history has resolved.
            !historyLoaded && connectionState !== 'disconnected' ? (
              <ChatFeedSkeleton />
            ) : (
              <EmptyFeed title={t('chat.empty')} hint={t('chat.emptyHint')} />
            )
          }
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
        />

        {/* Composer, or a read-only bar explaining why posting is unavailable. */}
        {canPost ? (
          <View>
            {/* Reply banner: shown above the input while composing a reply. */}
            {replyTarget ? (
              <View style={styles.replyBanner}>
                <View style={styles.replyBannerText}>
                  <RNText style={styles.replyBannerHandle} numberOfLines={1}>
                    {`↩ ${t('chat.replyingToLabel')} `}
                    <RNText style={styles.replyBannerSender}>
                      {replySenderDisplay}
                    </RNText>
                  </RNText>
                  <RNText style={styles.replyBannerPreview} numberOfLines={1}>
                    {replyPreviewText}
                  </RNText>
                </View>
                <Pressable
                  onPress={() => setReplyTarget(null)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.cancelReply')}
                  style={styles.replyCancel}
                >
                  <Ionicons name="close" size={16} color={TEXT_MUTED} />
                </Pressable>
              </View>
            ) : null}
            <View style={styles.composer}>
              <RNText style={styles.caret}>{'>'}</RNText>
              <TextInput
                ref={inputRef}
                style={[styles.composerInput, { height: inputHeight }]}
                placeholder={t('chat.composerPlaceholder')}
                placeholderTextColor={TEXT_TIME}
                value={input}
                onChangeText={setInput}
              multiline
              maxLength={MAX_MESSAGE_LENGTH}
              onContentSizeChange={(e) =>
                setInputHeight(
                  Math.min(
                    MAX_INPUT_HEIGHT,
                    Math.max(MIN_INPUT_HEIGHT, e.nativeEvent.contentSize.height)
                  )
                )
              }
              onSubmitEditing={handleSend}
              blurOnSubmit={false}
              returnKeyType="send"
            />
            <Pressable
              onPress={handleSend}
              disabled={!hasDraft}
              accessibilityRole="button"
              accessibilityLabel={t('chat.send')}
              hitSlop={8}
            >
              <RNText
                style={[
                  styles.sendGlyph,
                  { color: hasDraft ? colors.success : TEXT_REPLY_HANDLE },
                ]}
              >
                {'↵'}
              </RNText>
            </Pressable>
            </View>
          </View>
        ) : !hasAddress ? (
          // No address → prompt to add one.
          <View style={styles.readOnly}>
            <View style={styles.readOnlyLeft}>
              <Ionicons
                name="lock-closed-outline"
                size={16}
                color={TEXT_MUTED}
                style={{ marginRight: 8 }}
              />
              <RNText style={styles.readOnlyText} numberOfLines={2}>
                {t('chat.composerReadOnly')}
              </RNText>
            </View>
            <Pressable
              onPress={() => navigation.navigate('Settings')}
              accessibilityRole="button"
              style={styles.addBtn}
            >
              <RNText style={styles.addBtnText}>{t('chat.addAddress')}</RNText>
            </Pressable>
          </View>
        ) : (
          // Address set but not (yet) eligible: gate denied vs still verifying.
          <View style={[styles.readOnly, { justifyContent: 'flex-start' }]}>
            <Ionicons
              name={gateDenied ? 'lock-closed-outline' : 'ellipsis-horizontal'}
              size={16}
              color={TEXT_MUTED}
              style={{ marginRight: 8 }}
            />
            <RNText style={[styles.readOnlyText, { flex: 1 }]}>
              {gateDenied ? t('chat.postingLocked') : t('chat.composerVerifying')}
            </RNText>
          </View>
        )}
      </KeyboardAvoidingView>

      <NicknameSheet
        visible={nicknameOpen}
        onClose={() => setNicknameOpen(false)}
        token={token}
        refreshToken={refreshToken}
        initialNickname={selfNickname ?? ''}
        locked={selfOfficial}
      />

      <MessageActionsSheet
        message={liveActionMessage}
        isOwn={!!selfKey && liveActionMessage?.address === selfKey}
        onClose={() => setActionMessage(null)}
        onReply={handleReply}
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

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    paddingBottom: 14,
    paddingHorizontal: 20,
  },
  title: {
    fontFamily: GROTESK_BOLD,
    fontSize: 26,
    color: '#ffffff',
    letterSpacing: -0.26,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  online: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 },
  onlineText: { fontFamily: MONO, fontSize: 13, color: TEXT_MUTED },

  // Pinned strip
  pinned: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: PIN_BORDER,
    backgroundColor: PIN_BG,
    paddingVertical: 9,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  pinnedBody: {
    flex: 1,
    fontFamily: GROTESK,
    fontSize: 12.5,
    color: TEXT_PINNED,
    lineHeight: 17,
  },

  // Feed / rows
  // Inverted list: newest at index 0 renders at the bottom, and short content
  // naturally rests at the bottom of the viewport (iMessage-style anchoring).
  feed: { flex: 1, minHeight: 0 },
  feedContent: { paddingVertical: 8 },
  loadingOlder: { paddingVertical: 12, alignItems: 'center' },
  skeletonWrap: { paddingVertical: 8 },
  skeletonRow: { paddingVertical: 9, paddingHorizontal: 20, gap: 7 },
  emptyWrap: { alignItems: 'center', paddingVertical: 48, gap: 6 },
  emptyTitle: { fontFamily: MONO, fontSize: 14, color: TEXT_MUTED },
  emptyHint: { fontFamily: MONO, fontSize: 12, color: TEXT_TIME },
  separator: { height: 1, backgroundColor: HAIRLINE },

  // Day divider: centered mono label between hairline rules.
  dayDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 6,
  },
  dayRule: { flex: 1, height: 1, backgroundColor: PIN_BORDER },
  dayLabel: {
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: 1.5,
    color: TEXT_MUTED,
    textTransform: 'uppercase',
  },
  row: {
    paddingVertical: 9,
    paddingHorizontal: 20,
    // Opaque so the swipe-reveal action behind the row isn't visible at rest.
    backgroundColor: colors.background,
  },
  rowHighlight: { backgroundColor: HIGHLIGHT_BG },
  // Right-swipe reveal: a reply glyph in a full-height strip.
  swipeAction: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 24,
    backgroundColor: colors.background,
  },
  swipeGlyph: { fontFamily: MONO, fontSize: 20, color: TEXT_MUTED },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  identicon: {
    width: 18,
    height: 18,
    borderWidth: 1,
    borderColor: IDENTICON_BORDER,
    flexDirection: 'row',
    flexWrap: 'wrap',
    overflow: 'hidden',
  },
  handle: {
    fontFamily: MONO,
    fontSize: 12,
    color: TEXT_MUTED,
    letterSpacing: 0.24,
  },
  handleSelf: {
    fontFamily: MONO,
    fontSize: 12,
    color: '#000000',
    backgroundColor: CHIP_BG,
    paddingHorizontal: 7,
    paddingVertical: 1,
    letterSpacing: 0.24,
  },
  official: { fontFamily: MONO, fontSize: 11, color: colors.primary, marginLeft: -4 },
  time: { fontFamily: MONO, fontSize: 11, color: TEXT_TIME },

  // Reply quote
  replyQuote: {
    marginLeft: 27,
    marginTop: 5,
    borderLeftWidth: 2,
    borderLeftColor: REPLY_BAR,
    paddingLeft: 9,
  },
  replyHandle: { fontFamily: MONO, fontSize: 10, color: TEXT_REPLY_HANDLE },
  replyPreview: {
    fontFamily: GROTESK,
    fontSize: 11.5,
    color: TEXT_REPLY_PREVIEW,
    lineHeight: 15,
  },
  // Muted/italic placeholder when the quoted parent is unavailable.
  replyPreviewMuted: { color: TEXT_REPLY_HANDLE, fontStyle: 'italic' },

  // Body
  body: {
    fontFamily: GROTESK,
    fontSize: 15,
    color: TEXT_BODY,
    lineHeight: 21,
    marginLeft: 27,
    marginTop: 4,
  },

  // Reactions
  reactions: { flexDirection: 'row', flexWrap: 'wrap', marginLeft: 27, marginTop: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
  },
  chipCount: { fontFamily: MONO, fontSize: 12, color: TEXT_BODY },

  // Composer reply banner
  // Full-width band above the composer (not an inset box): a top hairline
  // separates it from the feed, and the composer's own top border closes it
  // off below — matching the edge-to-edge dividers used elsewhere.
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: EDGE,
  },
  replyBannerText: {
    flex: 1,
    borderLeftWidth: 2,
    borderLeftColor: REPLY_BAR,
    paddingLeft: 10,
  },
  replyBannerHandle: { fontFamily: MONO, fontSize: 11, color: TEXT_MUTED },
  // Bold, bright sender in the "Replying to <sender>" line.
  replyBannerSender: { fontFamily: MONO_BOLD, color: TEXT_BODY },
  replyBannerPreview: {
    fontFamily: GROTESK,
    fontSize: 12.5,
    color: TEXT_REPLY_PREVIEW,
    lineHeight: 16,
    marginTop: 2,
  },
  replyCancel: { borderWidth: 1, borderColor: colors.border, padding: 6 },

  // Composer
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: EDGE,
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 10,
  },
  caret: { fontFamily: MONO, fontSize: 15, color: '#ffffff' },
  sendGlyph: { fontFamily: MONO, fontSize: 20, lineHeight: 24 },
  composerInput: {
    flex: 1,
    fontFamily: MONO,
    fontSize: 14,
    color: TEXT_BODY,
    padding: 0,
    maxHeight: MAX_INPUT_HEIGHT,
  },

  // Read-only / gate bars
  readOnly: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: EDGE,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  readOnlyLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 },
  readOnlyText: { fontFamily: MONO, fontSize: 13, color: TEXT_MUTED },
  addBtn: { borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8 },
  addBtnText: { fontFamily: MONO, fontSize: 13, color: TEXT_BODY },
});
