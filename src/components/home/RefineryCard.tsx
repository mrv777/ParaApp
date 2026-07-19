/**
 * RefineryCard - Read-only monitor for the user's Refinery (hashrate
 * marketplace) orders. One row per order: id, status, delivery progress and
 * best share; tapping a row opens the full RefineryOrderSheet.
 *
 * Renders nothing when the address has no orders — most users never touch the
 * Refinery, and order creation/payment is website-only (wallet required), so
 * an empty card would be noise on Home.
 */

import { useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Card } from '../Card';
import { Text } from '../Text';
import { RefineryOrderSheet } from './RefineryOrderSheet';
import { useUserStore, selectRefineryOrders } from '@/store/userStore';
import { useSettingsStore } from '@/store/settingsStore';
import { formatDifficulty } from '@/utils/formatting';
import { haptics } from '@/utils/haptics';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';
import type { RefineryOrderStatus, RefineryOrderSummary } from '@/types';

const STATUS_COLORS: Record<RefineryOrderStatus, string> = {
  pending: '#f7931a',
  in_mempool: colors.warning,
  active: colors.success,
  fulfilled: colors.textValue,
  cancelled: colors.textDim,
  disconnected: colors.danger,
  expired: colors.textDim,
};

const STATUS_KEYS: Record<RefineryOrderStatus, string> = {
  pending: 'home.refineryStatusPending',
  in_mempool: 'home.refineryStatusInMempool',
  active: 'home.refineryStatusActive',
  fulfilled: 'home.refineryStatusFulfilled',
  cancelled: 'home.refineryStatusCancelled',
  disconnected: 'home.refineryStatusDisconnected',
  expired: 'home.refineryStatusExpired',
};

export function orderProgress(order: {
  requested_hash_days: number | null;
  delivered_hash_days: number;
}): number | null {
  if (order.requested_hash_days == null || order.requested_hash_days <= 0) return null;
  return Math.min(1, order.delivered_hash_days / order.requested_hash_days);
}

export interface RefineryCardProps {
  className?: string;
}

export function RefineryCard({ className = '' }: RefineryCardProps) {
  const { t } = useTranslation();
  const bitcoinAddress = useSettingsStore((s) => s.bitcoinAddress);
  const orders = useUserStore(selectRefineryOrders);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  // The card stays mounted while hidden (it returns null below), so a
  // selection must not survive an address switch — the sheet would reopen on
  // the previous address's order once the new address's orders load.
  useEffect(() => {
    setSelectedOrderId(null);
  }, [bitcoinAddress]);

  if (!bitcoinAddress || !orders || orders.length === 0) return null;

  return (
    <Card padding="none" className={className}>
      <View
        className="flex-row items-center"
        style={{ gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}
      >
        <Ionicons name="flask-outline" size={16} color={colors.textMuted} />
        <Text variant="subtitle" style={{ fontSize: 15, color: colors.textHigh }}>
          {t('home.refinery')}
        </Text>
      </View>

      {orders.map((order) => (
        <OrderRow
          key={order.id}
          order={order}
          onPress={() => {
            haptics.light();
            setSelectedOrderId(order.id);
          }}
        />
      ))}

      <RefineryOrderSheet
        visible={selectedOrderId !== null}
        orderId={selectedOrderId}
        onClose={() => setSelectedOrderId(null)}
      />
    </Card>
  );
}

function OrderRow({
  order,
  onPress,
}: {
  order: RefineryOrderSummary;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const progress = orderProgress(order);

  return (
    <Pressable
      onPress={onPress}
      className="border-t border-border-light active:opacity-60"
      style={{ paddingHorizontal: 16, paddingVertical: 12 }}
      accessibilityRole="button"
      accessibilityLabel={t('home.refineryOrder', { id: order.id })}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center" style={{ gap: 10 }}>
          <Text variant="mono" style={{ fontSize: 13, color: colors.textValue }}>
            #{order.id}
          </Text>
          <Text
            variant="mono"
            className="uppercase"
            style={{ fontSize: 10, letterSpacing: 1, color: STATUS_COLORS[order.status] }}
          >
            {t(STATUS_KEYS[order.status])}
          </Text>
          {order.review === 'flagged' && (
            <Ionicons name="flag" size={11} color={colors.danger} />
          )}
        </View>
        <View className="flex-row items-center" style={{ gap: 8 }}>
          {order.best_share != null && order.best_share > 0 && (
            <Text variant="mono" style={{ fontSize: 12, color: colors.textFaint }}>
              {t('home.refineryBestShare')} {formatDifficulty(order.best_share)}
            </Text>
          )}
          <Ionicons name="chevron-forward" size={13} color={colors.textDim} />
        </View>
      </View>

      {/* Delivery progress — thin hairline bar, or "unlimited" when uncapped */}
      <View className="flex-row items-center" style={{ gap: 10, marginTop: 8 }}>
        <View style={{ flex: 1, height: 3, backgroundColor: colors.borderLight }}>
          <View
            style={{
              height: 3,
              width: `${(progress ?? 1) * 100}%`,
              backgroundColor: progress == null ? colors.borderLight : colors.primary,
            }}
          />
        </View>
        <Text variant="mono" style={{ fontSize: 10, color: colors.textFaint }}>
          {progress == null
            ? t('home.refineryUnlimited')
            : `${Math.round(progress * 100)}%`}
        </Text>
      </View>
    </Pressable>
  );
}
