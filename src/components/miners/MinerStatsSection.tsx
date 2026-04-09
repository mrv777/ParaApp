/**
 * MinerStatsSection - Grid display of miner performance stats
 */

import { View } from 'react-native';
import { Text } from '../Text';
import type { LocalMiner } from '@/types';
import type { TemperatureUnit } from '@/utils/formatting';
import {
  formatHashrate,
  formatTemperature,
  formatPower,
  formatVoltage,
  formatUptime,
  formatDifficulty,
  formatPercent,
  formatNumber,
} from '@/utils/formatting';
import { tempThresholds } from '@/constants/theme';
import { useTranslation } from '@/i18n';

export interface MinerStatsSectionProps {
  miner: LocalMiner;
  temperatureUnit: TemperatureUnit;
}

interface StatItemProps {
  label: string;
  value: string;
  subValue?: string;
  color?: 'default' | 'warning' | 'danger' | 'success';
}

function StatItem({ label, value, subValue, color = 'default' }: StatItemProps) {
  return (
    <View className="flex-1 min-w-[45%] p-3 bg-secondary rounded-lg">
      <Text variant="caption" color="muted" className="mb-1">
        {label}
      </Text>
      <Text variant="subtitle" color={color} className="font-semibold">
        {value}
      </Text>
      {subValue && (
        <Text variant="caption" color="muted" className="mt-0.5">
          {subValue}
        </Text>
      )}
    </View>
  );
}

function getTemperatureColor(temp: number): 'default' | 'warning' | 'danger' {
  if (temp >= tempThresholds.danger) return 'danger';
  if (temp >= tempThresholds.caution) return 'warning';
  return 'default';
}

function getHwErrorColor(rate: number): 'default' | 'warning' | 'danger' {
  if (rate > 5) return 'danger';
  if (rate > 1) return 'warning';
  return 'default';
}

export function MinerStatsSection({
  miner,
  temperatureUnit,
}: MinerStatsSectionProps) {
  const { t } = useTranslation();

  // Convert hashrate from GH/s to H/s for formatter
  const hashrateHs = miner.hashRate * 1e9;
  const expectedHs = miner.expectedHashrate * 1e9;

  // Calculate share ratio
  const totalShares = miner.sharesAccepted + miner.sharesRejected;
  const rejectRate =
    totalShares > 0
      ? ((miner.sharesRejected / totalShares) * 100).toFixed(1)
      : '0';

  return (
    <View className="px-4 mb-4">
      <Text variant="caption" color="muted" className="mb-2 uppercase">
        {t('miners.performance')}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <StatItem
          label={t('miners.hashrate')}
          value={formatHashrate(hashrateHs)}
          subValue={t('miners.expected', { value: formatHashrate(expectedHs) })}
        />
        <StatItem
          label={t('miners.temperature')}
          value={formatTemperature(miner.temp, temperatureUnit)}
          color={getTemperatureColor(miner.temp)}
        />
        <StatItem label={t('miners.power')} value={formatPower(miner.power)} />
        <StatItem label={t('miners.voltage')} value={formatVoltage(miner.voltage)} />
        <StatItem
          label={t('miners.shares')}
          value={formatNumber(miner.sharesAccepted)}
          subValue={t('miners.rejected', { rate: rejectRate })}
        />
        <StatItem label={t('miners.uptime')} value={formatUptime(miner.uptimeSeconds)} />
        <StatItem
          label={t('miners.bestDiff')}
          value={formatDifficulty(miner.bestDiff)}
          subValue={t('miners.session', { value: formatDifficulty(miner.bestSessionDiff) })}
        />
        <StatItem label={t('miners.fanSpeed')} value={formatPercent(miner.fanSpeed)} />
        {miner.hwErrors !== undefined && (
          <StatItem
            label={t('miners.hwErrors')}
            value={formatNumber(miner.hwErrors)}
            subValue={t('miners.hwErrorRate', { rate: (miner.hwErrorRate ?? 0).toFixed(1) })}
            color={getHwErrorColor(miner.hwErrorRate ?? 0)}
          />
        )}
      </View>
    </View>
  );
}
