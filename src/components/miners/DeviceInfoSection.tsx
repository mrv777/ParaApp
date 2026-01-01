/**
 * DeviceInfoSection - Device information display
 */

import { View } from 'react-native';
import { Text } from '../Text';
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
  const poolUrl = miner.stratumUrl
    ? `${miner.stratumUrl}:${miner.stratumPort}`
    : '--';

  return (
    <View className="px-4 mb-4">
      <Text variant="caption" color="muted" className="mb-2 uppercase">
        Device Info
      </Text>
      <View className="bg-secondary rounded-lg px-4">
        <InfoRow label="Model" value={miner.deviceModel} />
        <InfoRow label="ASIC" value={miner.ASICModel} />
        <InfoRow label="Firmware" value={miner.version} />
        <InfoRow label="IP Address" value={miner.ip} />
        <InfoRow label="Hostname" value={miner.hostname} />
        <InfoRow label="Pool" value={poolUrl} />
        <InfoRow label="Worker" value={truncateWorker(miner.stratumUser)} />
        {/* WiFi row - no bottom border (last item) */}
        <View className="flex-row justify-between py-2.5 gap-4">
          <Text variant="body" color="muted" className="flex-shrink-0">
            WiFi
          </Text>
          <Text variant="body" className="font-medium flex-shrink text-right" numberOfLines={1}>
            {miner.wifiSSID || '--'}
          </Text>
        </View>
      </View>
    </View>
  );
}
