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

export function MinerStatsSection({
  miner,
  temperatureUnit,
}: MinerStatsSectionProps) {
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
        Performance
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <StatItem
          label="Hashrate"
          value={formatHashrate(hashrateHs)}
          subValue={`Expected: ${formatHashrate(expectedHs)}`}
        />
        <StatItem
          label="Temperature"
          value={formatTemperature(miner.temp, temperatureUnit)}
          color={getTemperatureColor(miner.temp)}
        />
        <StatItem label="Power" value={formatPower(miner.power)} />
        <StatItem label="Voltage" value={formatVoltage(miner.voltage)} />
        <StatItem
          label="Shares"
          value={formatNumber(miner.sharesAccepted)}
          subValue={`${rejectRate}% rejected`}
        />
        <StatItem label="Uptime" value={formatUptime(miner.uptimeSeconds)} />
        <StatItem
          label="Best Diff"
          value={formatDifficulty(miner.bestDiff)}
          subValue={`Session: ${formatDifficulty(miner.bestSessionDiff)}`}
        />
        <StatItem label="Fan Speed" value={formatPercent(miner.fanSpeed)} />
      </View>
    </View>
  );
}
