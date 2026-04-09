/**
 * DeviceInfoSection - Device information display
 */

import { View } from 'react-native';
import { Text } from '../Text';
import { Badge } from '../Badge';
import { useTranslation } from '@/i18n';
import { truncateWorker } from '@/utils/formatting';
import type { LocalMiner } from '@/types';

export interface DeviceInfoSectionProps {
  miner: LocalMiner;
}

interface InfoRowProps {
  label: string;
  value: string;
  /** Allow value to wrap to multiple lines */
  multiline?: boolean;
  /** Hide bottom border (for last item) */
  isLast?: boolean;
}

function InfoRow({ label, value, multiline = false, isLast = false }: InfoRowProps) {
  return (
    <View className={`flex-row justify-between py-2.5 gap-4 ${isLast ? '' : 'border-b border-border'}`}>
      <Text variant="body" color="muted" className="flex-shrink-0">
        {label}
      </Text>
      <Text
        variant="body"
        className="font-medium flex-shrink text-right"
        numberOfLines={multiline ? undefined : 1}
      >
        {value || '--'}
      </Text>
    </View>
  );
}

function FallbackPoolRow({ miner }: { miner: LocalMiner }) {
  const { t } = useTranslation();
  const fallbackUrl = miner.fallbackStratumUrl
    ? `${miner.fallbackStratumUrl}:${miner.fallbackStratumPort ?? 3333}`
    : '--';

  return (
    <View className="flex-row justify-between py-2.5 gap-4">
      <Text variant="body" color="muted" className="flex-shrink-0">
        {t('miners.fallbackPool')}
      </Text>
      <View className="flex-row items-center gap-2 flex-shrink">
        {miner.isUsingFallbackStratum && (
          <Badge variant="warning" size="sm">{t('miners.active')}</Badge>
        )}
        <Text variant="body" className="font-medium text-right" numberOfLines={1}>
          {fallbackUrl}
        </Text>
      </View>
    </View>
  );
}

export function DeviceInfoSection({ miner }: DeviceInfoSectionProps) {
  const { t } = useTranslation();
  const poolUrl = miner.stratumUrl
    ? `${miner.stratumUrl}:${miner.stratumPort}`
    : '--';

  return (
    <View className="px-4 mb-4">
      <Text variant="caption" color="muted" className="mb-2 uppercase">
        {t('miners.deviceInfo')}
      </Text>
      <View className="bg-secondary rounded-lg px-4">
        <InfoRow label={t('miners.model')} value={miner.deviceModel} />
        <InfoRow label={t('miners.asic')} value={miner.ASICModel} />
        <InfoRow label={t('miners.firmware')} value={miner.version} />
        <InfoRow label={t('miners.ipAddress')} value={miner.ip} />
        <InfoRow label={t('miners.hostname')} value={miner.hostname} />
        <InfoRow label={t('miners.pool')} value={poolUrl} />
        <InfoRow label={t('miners.worker')} value={truncateWorker(miner.stratumUser)} />
        <InfoRow label={t('miners.wifi')} value={miner.wifiSSID || ''} isLast={!miner.rssi && !miner.serialNumber && !miner.fallbackStratumUrl} />
        {miner.rssi !== undefined && (
          <InfoRow label={t('miners.wifiSignal')} value={`${miner.rssi} dBm`} isLast={!miner.serialNumber && !miner.fallbackStratumUrl} />
        )}
        {miner.serialNumber && (
          <InfoRow label={t('miners.serialNumber')} value={miner.serialNumber} isLast={!miner.fallbackStratumUrl} />
        )}
        {miner.fallbackStratumUrl !== undefined && (
          <FallbackPoolRow miner={miner} />
        )}
      </View>
    </View>
  );
}
