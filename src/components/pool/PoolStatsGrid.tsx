/**
 * PoolStatsGrid - 3-column grid of square bordered stat boxes (terminal/
 * brutalist). Each box is a hairline square with a small-caps label over a bold
 * mono value. No per-stat icons (matches the Home screen).
 */

import { View } from 'react-native';
import { Text } from '../Text';
import { SkeletonLoader } from '../SkeletonLoader';
import { formatNumber, formatDifficulty } from '@/utils/formatting';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';
import type { PoolStats } from '@/types';

export interface PoolStatsGridProps {
  stats: PoolStats | null;
  bitcoinPrice: number | null;
  isLoading?: boolean;
  className?: string;
}

/** One square bordered stat cell. Fixed 3-up via a fractional flex-basis. */
function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View
      className="border border-border"
      style={{ width: '31.7%', paddingHorizontal: 10, paddingVertical: 9 }}
    >
      <Text
        variant="mono"
        className="uppercase"
        style={{ fontSize: 8, letterSpacing: 0.8, color: colors.textDim }}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        variant="mono"
        className="font-bold text-foreground"
        style={{ fontSize: 14, marginTop: 4 }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
  );
}

export function PoolStatsGrid({
  stats,
  bitcoinPrice,
  isLoading = false,
  className = '',
}: PoolStatsGridProps) {
  const { t } = useTranslation();

  if (isLoading && !stats) {
    return (
      <View
        className={`flex-row flex-wrap ${className}`}
        style={{ gap: 8, justifyContent: 'space-between' }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <View
            key={i}
            className="border border-border"
            style={{ width: '31.7%', paddingHorizontal: 10, paddingVertical: 9 }}
          >
            <SkeletonLoader variant="text" width="60%" height={8} />
            <View style={{ height: 4 }} />
            <SkeletonLoader variant="text" width="80%" height={14} />
          </View>
        ))}
      </View>
    );
  }

  const lastBlockHeight = stats?.lastBlockTime;
  const highestDiff = stats?.highestDifficulty ?? '--';

  return (
    <View
      className={`flex-row flex-wrap ${className}`}
      style={{ gap: 8, justifyContent: 'space-between' }}
    >
      <StatBox label={t('pool.users')} value={formatNumber(stats?.users ?? 0)} />
      <StatBox label={t('pool.workers')} value={formatNumber(stats?.workers ?? 0)} />
      <StatBox
        label={t('pool.lastBlock')}
        value={lastBlockHeight ? `#${lastBlockHeight}` : '--'}
      />
      <StatBox label={t('pool.uptime')} value={stats?.uptime ?? '--'} />
      <StatBox
        label={t('pool.btcPrice')}
        value={bitcoinPrice ? `$${formatNumber(bitcoinPrice, 0)}` : '--'}
      />
      <StatBox
        label={t('pool.highestDiff')}
        value={typeof highestDiff === 'number' ? formatDifficulty(highestDiff) : highestDiff}
      />
    </View>
  );
}
