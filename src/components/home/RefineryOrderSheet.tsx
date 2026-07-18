/**
 * RefineryOrderSheet - Full detail for one Refinery order, fetched on open
 * from the public router API. Read-only: payment/creation stay on the website.
 * Block height and txids deep-link to mempool.space.
 */

import { useEffect, useState } from 'react';
import { View, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Sheet } from '../Sheet';
import { Text } from '../Text';
import { getRefineryOrder } from '@/api/refinery';
import { orderProgress } from './RefineryCard';
import {
  formatDifficulty,
  formatHashDays,
  formatHashrate,
  formatTimestamp,
  truncateAddress,
} from '@/utils/formatting';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';
import type { RefineryOrderDetail } from '@/types';

const MEMPOOL_BASE = 'https://mempool.space';

export interface RefineryOrderSheetProps {
  visible: boolean;
  orderId: number | null;
  onClose: () => void;
}

export function RefineryOrderSheet({ visible, orderId, onClose }: RefineryOrderSheetProps) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<RefineryOrderDetail | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!visible || orderId == null) return;
    let cancelled = false;
    setDetail(null);
    setFailed(false);
    getRefineryOrder(orderId).then((result) => {
      if (cancelled) return;
      if (result.success) setDetail(result.data);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, orderId]);

  const progress = detail
    ? orderProgress({
        requested_hash_days: detail.requested_hash_days,
        delivered_hash_days: detail.upstream.delivered_hash_days,
      })
    : null;

  return (
    <Sheet visible={visible} onClose={onClose} scrollable>
      <View className="flex-row items-center justify-between pb-3">
        <Text variant="subtitle" className="font-semibold">
          {t('home.refineryOrder', { id: orderId ?? '' })}
        </Text>
        <Pressable onPress={onClose} className="p-2 -mr-2" hitSlop={8}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
      </View>

      {failed ? (
        <Text variant="caption" color="danger" className="py-6 text-center">
          {t('common.error')}
        </Text>
      ) : !detail ? (
        <Text variant="caption" color="muted" className="py-6 text-center">
          {t('common.loading')}
        </Text>
      ) : (
        <View style={{ gap: 0 }}>
          <DetailRow
            label={t('home.refineryStatus')}
            value={t(statusKey(detail.status))}
            isFirst
          />
          {detail.review !== 'clean' && (
            <DetailRow
              label={t('home.refineryReview')}
              value={
                detail.review === 'flagged'
                  ? t('home.refineryFlagged')
                  : t('home.refineryCleared')
              }
              valueColor={detail.review === 'flagged' ? colors.danger : colors.textValue}
            />
          )}

          {/* Delivered / requested progress */}
          <View
            className="border-t border-border-light"
            style={{ paddingVertical: 12 }}
          >
            <View className="flex-row items-center justify-between">
              <Text variant="mono" style={{ fontSize: 11, color: colors.textDim }}>
                {t('home.refineryProgress').toUpperCase()}
              </Text>
              <Text variant="mono" style={{ fontSize: 13, color: colors.textValue }}>
                {formatHashDays(detail.upstream.delivered_hash_days)}
                {' / '}
                {detail.requested_hash_days != null
                  ? formatHashDays(detail.requested_hash_days)
                  : t('home.refineryUnlimited')}
              </Text>
            </View>
            {progress != null && (
              <View style={{ height: 3, backgroundColor: colors.borderLight, marginTop: 8 }}>
                <View
                  style={{
                    height: 3,
                    width: `${progress * 100}%`,
                    backgroundColor: colors.primary,
                  }}
                />
              </View>
            )}
          </View>

          {detail.upstream.best_share != null && detail.upstream.best_share > 0 && (
            <DetailRow
              label={t('home.refineryBestShare')}
              value={formatDifficulty(detail.upstream.best_share)}
            />
          )}
          <DetailRow
            label={t('home.refineryHashrate')}
            value={formatHashrate(detail.upstream.hashrate_1m)}
          />
          <DetailRow
            label={t('home.refineryCreated')}
            value={formatTimestamp(detail.created_at * 1000)}
          />
          {detail.created_at_height != null && (
            <LinkRow
              label={t('home.refineryBlockHeight')}
              value={`#${detail.created_at_height}`}
              onPress={() =>
                Linking.openURL(`${MEMPOOL_BASE}/block/${detail.created_at_height}`)
              }
            />
          )}

          {detail.txids.length > 0 && (
            <View className="border-t border-border-light" style={{ paddingVertical: 12 }}>
              <Text
                variant="mono"
                style={{ fontSize: 11, color: colors.textDim, marginBottom: 8 }}
              >
                {t('home.refineryTxids').toUpperCase()}
              </Text>
              {detail.txids.map((txid) => (
                <Pressable
                  key={txid}
                  onPress={() => Linking.openURL(`${MEMPOOL_BASE}/tx/${txid}`)}
                  className="flex-row items-center justify-between active:opacity-60"
                  style={{ paddingVertical: 6 }}
                >
                  <Text variant="mono" style={{ fontSize: 12, color: colors.textSecondary }}>
                    {truncateAddress(txid, 8)}
                  </Text>
                  <Ionicons name="open-outline" size={13} color={colors.textMuted} />
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}
    </Sheet>
  );
}

function statusKey(status: RefineryOrderDetail['status']): string {
  switch (status) {
    case 'pending':
      return 'home.refineryStatusPending';
    case 'in_mempool':
      return 'home.refineryStatusInMempool';
    case 'active':
      return 'home.refineryStatusActive';
    case 'fulfilled':
      return 'home.refineryStatusFulfilled';
    case 'cancelled':
      return 'home.refineryStatusCancelled';
    case 'disconnected':
      return 'home.refineryStatusDisconnected';
    case 'expired':
      return 'home.refineryStatusExpired';
  }
}

function DetailRow({
  label,
  value,
  valueColor = colors.textValue,
  isFirst = false,
}: {
  label: string;
  value: string;
  valueColor?: string;
  isFirst?: boolean;
}) {
  return (
    <View
      className={`flex-row items-center justify-between ${isFirst ? '' : 'border-t border-border-light'}`}
      style={{ paddingVertical: 12 }}
    >
      <Text variant="mono" style={{ fontSize: 11, color: colors.textDim }}>
        {label.toUpperCase()}
      </Text>
      <Text variant="mono" style={{ fontSize: 13, color: valueColor }}>
        {value}
      </Text>
    </View>
  );
}

function LinkRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-between border-t border-border-light active:opacity-60"
      style={{ paddingVertical: 12 }}
    >
      <Text variant="mono" style={{ fontSize: 11, color: colors.textDim }}>
        {label.toUpperCase()}
      </Text>
      <View className="flex-row items-center" style={{ gap: 6 }}>
        <Text variant="mono" style={{ fontSize: 13, color: colors.textSecondary }}>
          {value}
        </Text>
        <Ionicons name="open-outline" size={13} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}
