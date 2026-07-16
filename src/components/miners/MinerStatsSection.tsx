/**
 * MinerStatsSection - Grid display of miner performance stats
 */

import { View } from 'react-native';
import { Text } from '../Text';
import { StatBox, type StatBoxColor } from '../StatBox';
import { colors } from '@/constants/colors';
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
import { getTempThresholdsFor } from '@/constants/theme';
import { useTranslation } from '@/i18n';

export interface MinerStatsSectionProps {
  miner: LocalMiner;
  temperatureUnit: TemperatureUnit;
}

interface StatEntry {
  label: string;
  value: string;
  subValue?: string;
  color?: StatBoxColor;
}

function getTemperatureColor(
  temp: number,
  minerType: string | undefined
): 'default' | 'warning' | 'danger' {
  const t = getTempThresholdsFor(minerType);
  if (temp >= t.danger) return 'danger';
  if (temp >= t.caution) return 'warning';
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

  const isAvalon = miner.minerType === 'avalon';
  const isKBox = miner.minerType === 'kbox';
  const standby = miner.isStandby === true;

  const entries: (StatEntry | null)[] = [
    {
      label: t('miners.hashrate'),
      // In standby the miner isn't hashing; `hashrateHs` is a decaying
      // lifetime average, so show the standby label and demote the
      // average to a clearly-secondary sub-value.
      value: standby ? t('miners.standby') : formatHashrate(hashrateHs),
      subValue: standby
        ? formatHashrate(hashrateHs)
        : expectedHs > 0
          ? t('miners.expected', { value: formatHashrate(expectedHs) })
          : undefined,
    },
    {
      label: t('miners.temperature'),
      value: formatTemperature(miner.temp, temperatureUnit),
      color: getTemperatureColor(miner.temp, miner.minerType),
      subValue:
        isAvalon &&
        miner.hashboardInletTemp !== undefined &&
        miner.hashboardOutletTemp !== undefined
          ? t('miners.airInOut', {
              in: formatTemperature(miner.hashboardInletTemp, temperatureUnit),
              out: formatTemperature(miner.hashboardOutletTemp, temperatureUnit),
            })
          : undefined,
    },
    // KBox doesn't report power draw — "0.0 W" would be wrong
    isKBox ? null : { label: t('miners.power'), value: formatPower(miner.power) },
    // Avalon: show work mode instead of voltage. KBox: its power mode
    // (Low/Medium/High or a custom overclock) — voltage isn't reported.
    isAvalon && miner.workMode !== undefined
      ? {
          label: t('miners.workMode'),
          value:
            miner.workMode === 0
              ? t('miners.workModeEco')
              : miner.workMode === 1
                ? t('miners.workModeStandard')
                : t('miners.workModeSuper'),
          subValue: miner.frequency > 0 ? `${miner.frequency} MHz` : undefined,
        }
      : isKBox
        ? {
            label: t('miners.kboxPowerMode'),
            value: miner.kboxPowerMode || '--',
            subValue: miner.frequency > 0 ? `${miner.frequency} MHz` : undefined,
          }
        : { label: t('miners.voltage'), value: formatVoltage(miner.voltage) },
    {
      label: t('miners.shares'),
      value: formatNumber(miner.sharesAccepted),
      subValue: t('miners.rejected', { rate: rejectRate }),
    },
    { label: t('miners.uptime'), value: formatUptime(miner.uptimeSeconds) },
    {
      label: t('miners.bestDiff'),
      value: formatDifficulty(miner.bestDiff),
      subValue: t('miners.session', { value: formatDifficulty(miner.bestSessionDiff) }),
    },
    // Avalon has 4 individual fans — show duty + per-fan range. AxeOS shows the single fan duty.
    isAvalon && miner.fanRpms && miner.fanRpms.length > 1
      ? {
          label: t('miners.fanSpeed'),
          value: formatPercent(miner.fanSpeed),
          subValue: `${miner.fanRpms.length} fans · ${Math.min(...miner.fanRpms)}–${Math.max(...miner.fanRpms)} RPM`,
        }
      : { label: t('miners.fanSpeed'), value: formatPercent(miner.fanSpeed) },
  ];

  if (miner.hwErrors !== undefined) {
    entries.push({
      label: t('miners.hwErrors'),
      value: formatNumber(miner.hwErrors),
      // KBox reports a count but no rate — skip the rate sub-line there
      subValue:
        miner.hwErrorRate !== undefined
          ? t('miners.hwErrorRate', { rate: miner.hwErrorRate.toFixed(1) })
          : undefined,
      color: getHwErrorColor(miner.hwErrorRate ?? 0),
    });
  }
  if (isAvalon && miner.poolPing !== undefined && miner.poolPing > 0) {
    entries.push({ label: t('miners.poolPing'), value: `${miner.poolPing} ms` });
  }

  return (
    <View>
      <Text
        variant="subtitle"
        style={{ fontSize: 15, color: colors.textHigh, marginBottom: 10 }}
      >
        {t('miners.performance')}
      </Text>
      <View className="flex-row flex-wrap" style={{ gap: 8, justifyContent: 'space-between' }}>
        {entries.filter((e): e is StatEntry => e !== null).map((entry, i) => (
          <StatBox
            key={i}
            label={entry.label}
            value={entry.value}
            subValue={entry.subValue}
            valueColor={entry.color}
            style={{ width: '48.5%' }}
          />
        ))}
      </View>
    </View>
  );
}
