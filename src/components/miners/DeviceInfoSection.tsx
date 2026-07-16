/**
 * DeviceInfoSection - Device information display
 */

import { Linking, Pressable, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../Text';
import { Card } from '../Card';
import { useTranslation } from '@/i18n';
import { truncateWorker } from '@/utils/formatting';
import { haptics } from '@/utils/haptics';
import { colors } from '@/constants/colors';
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
    <View
      className="flex-row justify-between items-center border-t border-border-light gap-4"
      style={{ paddingHorizontal: 16, paddingVertical: 11 }}
    >
      <Text
        variant="mono"
        className="flex-shrink-0"
        style={{ fontSize: 12, color: colors.textMuted }}
      >
        {label}
      </Text>
      <Text
        variant="mono"
        className="flex-shrink text-right"
        style={{ fontSize: 12, color: colors.textValue }}
        numberOfLines={multiline ? undefined : 1}
      >
        {value || '--'}
      </Text>
    </View>
  );
}

function IpAddressRow({ ip }: { ip: string }) {
  const { t } = useTranslation();

  const handlePress = () => {
    if (!ip) return;
    haptics.light();
    Linking.openURL(`http://${ip}`).catch(() => {
      // Ignore — most likely the device is unreachable from outside the LAN
    });
  };

  const handleLongPress = async () => {
    if (!ip) return;
    await Clipboard.setStringAsync(ip);
    haptics.success();
    Toast.show({
      type: 'success',
      text1: t('miners.ipCopied'),
      visibilityTime: 1500,
    });
  };

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={350}
      accessibilityRole="link"
      accessibilityLabel={`${t('miners.ipAddress')}: ${ip}. ${t('miners.openInBrowser')}`}
      android_ripple={{ color: colors.borderLight }}
      className="flex-row justify-between items-center gap-4 border-t border-border-light active:opacity-60"
      style={{ paddingHorizontal: 16, paddingVertical: 11 }}
    >
      <Text variant="mono" className="flex-shrink-0" style={{ fontSize: 12, color: colors.textMuted }}>
        {t('miners.ipAddress')}
      </Text>
      <View className="flex-row items-center gap-1.5 flex-shrink">
        <Text
          variant="mono"
          className="text-right"
          style={{ fontSize: 12, color: colors.textValue }}
          numberOfLines={1}
        >
          {ip || '--'}
        </Text>
        {!!ip && (
          <Ionicons name="open-outline" size={13} color={colors.textMuted} />
        )}
      </View>
    </Pressable>
  );
}

function FallbackPoolRow({ miner }: { miner: LocalMiner }) {
  const { t } = useTranslation();
  const fallbackUrl = miner.fallbackStratumUrl
    ? `${miner.fallbackStratumUrl}:${miner.fallbackStratumPort ?? 3333}`
    : '--';

  return (
    <View
      className="flex-row justify-between items-center gap-4 border-t border-border-light"
      style={{ paddingHorizontal: 16, paddingVertical: 11 }}
    >
      <Text variant="mono" className="flex-shrink-0" style={{ fontSize: 12, color: colors.textMuted }}>
        {t('miners.fallbackPool')}
      </Text>
      <View className="flex-row items-center gap-2 flex-shrink">
        {miner.isUsingFallbackStratum && (
          <Text
            variant="mono"
            className="uppercase"
            style={{ fontSize: 9, letterSpacing: 0.5, color: colors.warning }}
          >
            {t('miners.active')}
          </Text>
        )}
        <Text
          variant="mono"
          className="text-right"
          style={{ fontSize: 12, color: colors.textValue }}
          numberOfLines={1}
        >
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
  const isAvalon = miner.minerType === 'avalon';
  const isKBox = miner.minerType === 'kbox';
  const hasMac = isAvalon && !!miner.macAddress;
  const hasAsicCount = isAvalon && !!miner.asicCount;
  const hasFallback = miner.fallbackStratumUrl !== undefined;
  const hasSerial = !!miner.serialNumber;
  const hasRssi = miner.rssi !== undefined;

  return (
    <Card padding="none">
      <Text
        variant="subtitle"
        style={{ fontSize: 15, color: colors.textHigh, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}
      >
        {t('miners.deviceInfo')}
      </Text>
      <InfoRow label={t('miners.model')} value={miner.deviceModel} />
      <InfoRow label={t('miners.asic')} value={miner.ASICModel} />
      {hasAsicCount && (
        <InfoRow label={t('miners.asicCount')} value={String(miner.asicCount)} />
      )}
      {/* KBox API doesn't expose its firmware version */}
      {!isKBox && <InfoRow label={t('miners.firmware')} value={miner.version} />}
      <IpAddressRow ip={miner.ip} />
      {hasMac && (
        <InfoRow label={t('miners.macAddress')} value={miner.macAddress as string} />
      )}
      <InfoRow label={t('miners.hostname')} value={miner.hostname} />
      <InfoRow label={t('miners.pool')} value={poolUrl} />
      <InfoRow label={t('miners.worker')} value={truncateWorker(miner.stratumUser)} />
      {isKBox && miner.kboxPowerMode && (
        <InfoRow label={t('miners.kboxPowerMode')} value={miner.kboxPowerMode} />
      )}
      {isKBox && miner.kboxDualMining && (
        <InfoRow label={t('miners.kboxDualMining')} value={t('miners.active')} />
      )}
      {/* Avalons and the KBox (wired NanoPi) report no WiFi info */}
      {!isAvalon && !isKBox && (
        <InfoRow label={t('miners.wifi')} value={miner.wifiSSID || ''} />
      )}
      {hasRssi && (
        <InfoRow label={t('miners.wifiSignal')} value={`${miner.rssi} dBm`} />
      )}
      {hasSerial && (
        <InfoRow label={t('miners.serialNumber')} value={miner.serialNumber as string} />
      )}
      {hasFallback && <FallbackPoolRow miner={miner} />}
    </Card>
  );
}
