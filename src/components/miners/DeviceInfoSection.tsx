/**
 * DeviceInfoSection - Device information display
 */

import { View } from 'react-native';
import { Text } from '../Text';
import { useTranslation } from '@/i18n';
import type { LocalMiner } from '@/types';

export interface DeviceInfoSectionProps {
  miner: LocalMiner;
}

interface InfoRowProps {
  label: string;
  value: string;
  /** Allow value to wrap to multiple lines */
  multiline?: boolean;
}

function InfoRow({ label, value, multiline = false }: InfoRowProps) {
  return (
    <View className="flex-row justify-between py-2.5 border-b border-border gap-4">
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

/**
 * Truncate a worker name (often bitcoin address + worker suffix)
 */
function truncateWorker(worker: string, maxLength = 24): string {
  if (!worker || worker.length <= maxLength) return worker;

  // If it contains a dot (address.worker format), try to preserve worker name
  const dotIndex = worker.lastIndexOf('.');
  if (dotIndex > 0 && dotIndex < worker.length - 1) {
    const address = worker.substring(0, dotIndex);
    const workerName = worker.substring(dotIndex + 1);
    // Truncate address, keep worker name
    const truncatedAddr = address.length > 12
      ? `${address.slice(0, 6)}...${address.slice(-4)}`
      : address;
    return `${truncatedAddr}.${workerName}`;
  }

  // Simple truncation with ellipsis
  return `${worker.slice(0, 10)}...${worker.slice(-8)}`;
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
        {/* WiFi row - no bottom border (last item) */}
        <View className="flex-row justify-between py-2.5 gap-4">
          <Text variant="body" color="muted" className="flex-shrink-0">
            {t('miners.wifi')}
          </Text>
          <Text variant="body" className="font-medium flex-shrink text-right" numberOfLines={1}>
            {miner.wifiSSID || '--'}
          </Text>
        </View>
      </View>
    </View>
  );
}
