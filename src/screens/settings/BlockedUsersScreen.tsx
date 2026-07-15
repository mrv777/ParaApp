import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

import {
  fetchBlockedChatUsers,
  fetchChatSession,
  runTokenAction,
  unblockChatUser,
  type BlockedChatUser,
} from '@/api/chat';
import { isError } from '@/api/client';
import { Sheet } from '@/components/Sheet';
import { SkeletonLoader } from '@/components/SkeletonLoader';
import { Text } from '@/components/Text';
import { badgeEmoji } from '@/constants/chat';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';
import { useChatStore } from '@/store/chatStore';
import {
  selectBitcoinAddress,
  useSettingsStore,
} from '@/store/settingsStore';
import type { SettingsStackScreenProps } from '@/types/navigation';
import { truncateAddress } from '@/utils/formatting';
import { haptics } from '@/utils/haptics';
import { glyphCells } from '@/utils/identicon';

type Props = SettingsStackScreenProps<'BlockedUsers'>;

const ROW_H_PAD = 16;
const LABEL_COLOR = colors.primary;

export function BlockedUsersScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const bitcoinAddress = useSettingsStore(selectBitcoinAddress);
  const [token, setToken] = useState<string | null>(null);
  const [users, setUsers] = useState<BlockedChatUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [selected, setSelected] = useState<BlockedChatUser | null>(null);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const refreshToken = useCallback(async (): Promise<string | null> => {
    if (!bitcoinAddress) return null;
    const session = await fetchChatSession(bitcoinAddress);
    if (isError(session) || !session.data.data?.token) return null;
    const freshToken = session.data.data.token;
    setToken(freshToken);
    return freshToken;
  }, [bitcoinAddress]);

  const load = useCallback(
    async (quiet = false) => {
      if (!bitcoinAddress) {
        setLoading(false);
        setRefreshing(false);
        setToken(null);
        setUsers([]);
        setAccessDenied(false);
        setError(null);
        return;
      }

      if (quiet) setRefreshing(true);
      else setLoading(true);
      setError(null);
      setAccessDenied(false);

      // Fetch the session directly (rather than via refreshToken) so we can read
      // the status: a 403 means this address isn't eligible for chat (the locked
      // panel), whereas a network/timeout/5xx failure is transient and should
      // offer a retry instead of misreporting "not eligible".
      const session = await fetchChatSession(bitcoinAddress);
      if (isError(session) || !session.data.data?.token) {
        setToken(null);
        setUsers([]);
        if (isError(session) && session.error.status === 403) {
          setAccessDenied(true);
        } else {
          setError(t('settings.blockedUsersLoadFailed'));
        }
        setLoading(false);
        setRefreshing(false);
        return;
      }
      const freshToken = session.data.data.token;
      setToken(freshToken);

      const blocks = await fetchBlockedChatUsers(freshToken);
      if (isError(blocks) || !blocks.data.success || !blocks.data.data) {
        setError(t('settings.blockedUsersLoadFailed'));
        setUsers([]);
      } else {
        setUsers(blocks.data.data.users);
      }
      setLoading(false);
      setRefreshing(false);
    },
    [bitcoinAddress, t]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const handleRefresh = useCallback(() => {
    haptics.light();
    void load(true);
  }, [load]);

  const handleConfirmUnblock = useCallback(async () => {
    if (!selected || !token) return;
    setUnblockingId(selected.id);
    const res = await runTokenAction(token, refreshToken, (tk) =>
      unblockChatUser(tk, selected.id)
    );
    if (res && !isError(res) && res.data.success) {
      setUsers((current) => current.filter((user) => user.id !== selected.id));
      // The live chat socket (if any) loaded its block list at connect and won't
      // pick up this removal until it reconnects — flag it so the Chat screen
      // forces a reconnect on its next focus (see chatStore.blockListStale).
      useChatStore.getState().setBlockListStale(true);
      setSelected(null);
      haptics.success();
      Toast.show({ type: 'success', text1: t('settings.blockedUsersUnblocked') });
    } else {
      haptics.warning();
      Toast.show({
        type: 'error',
        text1: t('settings.blockedUsersUnblockFailed'),
      });
    }
    setUnblockingId(null);
  }, [refreshToken, selected, token, t]);

  const selectedName = useMemo(
    () => selected?.nickname || (selected ? truncateAddress(selected.address) : ''),
    [selected]
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={24} color={colors.textValue} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            variant="title"
            className="font-bold"
            style={{ fontSize: 28, lineHeight: 34, color: LABEL_COLOR }}
          >
            {t('settings.blockedUsers')}
          </Text>
        </View>
        <Pressable
          onPress={handleRefresh}
          disabled={loading || refreshing}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.refresh')}
          style={[styles.iconButton, (loading || refreshing) && { opacity: 0.45 }]}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : (
            <Ionicons name="refresh" size={19} color={colors.textMuted} />
          )}
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {!bitcoinAddress ? (
          <StatePanel
            icon="chatbubble-ellipses-outline"
            title={t('settings.blockedUsersNoAddress')}
            body={t('settings.blockedUsersNoAddressHint')}
          />
        ) : loading ? (
          <BlockedUsersSkeleton />
        ) : accessDenied ? (
          <StatePanel
            icon="lock-closed-outline"
            title={t('settings.blockedUsersLocked')}
            body={t('settings.blockedUsersLockedHint')}
          />
        ) : error ? (
          <StatePanel
            icon="alert-circle-outline"
            title={error}
            body={t('settings.blockedUsersRetryHint')}
            actionLabel={t('common.retry')}
            onAction={handleRefresh}
          />
        ) : users.length === 0 ? (
          <StatePanel
            icon="checkmark-circle-outline"
            title={t('settings.blockedUsersEmpty')}
            body={t('settings.blockedUsersEmptyHint')}
          />
        ) : (
          <View style={styles.list}>
            {users.map((user, index) => (
              <BlockedUserRow
                key={user.id}
                user={user}
                first={index === 0}
                busy={unblockingId === user.id}
                onPress={() => {
                  haptics.light();
                  setSelected(user);
                }}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <Sheet visible={!!selected} onClose={() => setSelected(null)}>
        <View style={{ paddingHorizontal: 4, paddingBottom: 4 }}>
          <Text
            variant="subtitle"
            className="font-semibold"
            style={{ color: colors.textValue, marginBottom: 8 }}
          >
            {t('settings.unblockUserTitle')}
          </Text>
          <Text
            variant="body"
            style={{ color: colors.textMuted, lineHeight: 22, marginBottom: 18 }}
          >
            {t('settings.unblockUserBody', { name: selectedName })}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={() => setSelected(null)}
              disabled={!!unblockingId}
              style={[styles.sheetButton, styles.cancelButton]}
            >
              <Text variant="body" style={{ color: colors.textValue }}>
                {t('common.cancel')}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleConfirmUnblock}
              disabled={!!unblockingId}
              style={[styles.sheetButton, styles.unblockButton]}
            >
              {unblockingId ? (
                <ActivityIndicator size="small" color="#0c0c0d" />
              ) : (
                <Text
                  variant="body"
                  className="font-semibold"
                  style={{ color: '#0c0c0d' }}
                >
                  {t('settings.unblock')}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </Sheet>
    </SafeAreaView>
  );
}

function BlockedUserRow({
  user,
  first,
  busy,
  onPress,
}: {
  user: BlockedChatUser;
  first: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const cells = useMemo(() => glyphCells(user.address, false), [user.address]);
  const displayName = user.nickname || truncateAddress(user.address);
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      style={[styles.row, !first && styles.rowDivider, busy && { opacity: 0.55 }]}
    >
      <View style={styles.identicon}>
        {cells.map((bg, i) => (
          <View
            key={i}
            style={{ width: '20%', height: '20%', backgroundColor: bg ?? 'transparent' }}
          />
        ))}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text
            variant="body"
            numberOfLines={1}
            style={{ color: colors.textValue, fontSize: 16, flexShrink: 1 }}
          >
            {displayName}
          </Text>
          {user.official ? (
            <Ionicons name="shield-checkmark" size={13} color={colors.textMuted} />
          ) : null}
          {user.badges?.map((b) => {
            const emoji = badgeEmoji(b);
            return emoji ? (
              <Text key={b} style={{ fontSize: 13 }}>
                {emoji}
              </Text>
            ) : null;
          })}
        </View>
        <Text
          variant="mono"
          numberOfLines={1}
          style={{ color: colors.textDim, fontSize: 11, marginTop: 3 }}
        >
          {t('settings.blockedUsersBlocked')}
        </Text>
      </View>
      <View style={styles.unblockPill}>
        {busy ? (
          <ActivityIndicator size="small" color={colors.textMuted} />
        ) : (
          <Text variant="mono" style={{ color: colors.textMuted, fontSize: 11 }}>
            {t('settings.unblock')}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

function StatePanel({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.statePanel}>
      <Ionicons name={icon} size={28} color={colors.textMuted} />
      <Text
        variant="subtitle"
        className="font-semibold"
        align="center"
        style={{ color: colors.textValue, marginTop: 12 }}
      >
        {title}
      </Text>
      <Text
        variant="body"
        align="center"
        style={{ color: colors.textMuted, lineHeight: 22, marginTop: 8 }}
      >
        {body}
      </Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} style={styles.stateAction}>
          <Text variant="body" style={{ color: colors.textValue }}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function BlockedUsersSkeleton() {
  return (
    <View style={styles.list}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.row, i > 0 && styles.rowDivider]}>
          <SkeletonLoader variant="circle" width={34} height={34} />
          <View style={{ flex: 1 }}>
            <SkeletonLoader variant="text" width="42%" height={15} />
            <View style={{ height: 8 }} />
            <SkeletonLoader variant="text" width="24%" height={10} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: colors.card,
  },
  iconButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },
  list: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: ROW_H_PAD,
    paddingVertical: 13,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' },
  identicon: {
    width: 34,
    height: 34,
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: colors.background,
  },
  unblockPill: {
    minWidth: 78,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
  },
  statePanel: {
    minHeight: 230,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  stateAction: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sheetButton: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  cancelButton: {
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: colors.surface,
  },
  unblockButton: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
});
