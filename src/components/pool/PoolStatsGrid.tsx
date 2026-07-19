/**
 * PoolStatsGrid - 3-column grid of square bordered stat boxes (terminal/
 * brutalist). Each box is a hairline square with a small-caps label over a bold
 * mono value. No per-stat icons (matches the Home screen).
 */

import { useCallback, useMemo } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Text } from '../Text';
import { SkeletonLoader } from '../SkeletonLoader';
import { formatNumber, formatDifficulty, formatExpectedBlockTime } from '@/utils/formatting';
import { derivePoolWork, getPoolBlockUrl } from '@/utils/poolStats';
import { haptics } from '@/utils/haptics';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';
import type { PoolStats, RoundWorkLeaderboardEntry } from '@/types';

const EMPTY_WORK_ENTRIES: RoundWorkLeaderboardEntry[] = [];

export interface PoolStatsGridProps {
  stats: PoolStats | null;
  bitcoinPrice: number | null;
  networkDifficulty: number | null;
  roundWorkEntries?: RoundWorkLeaderboardEntry[];
  isLoading?: boolean;
  className?: string;
}

/** One square bordered stat cell. Fixed 3-up via a fractional flex-basis. */
function StatBox({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const content = (
    <>
      <Text
        variant="mono"
        className="uppercase"
        style={{ fontSize: 8, letterSpacing: 0.8, color: colors.textDim }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
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
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="link"
        accessibilityLabel={`${label}: ${value}`}
        className="border border-border active:opacity-60"
        style={{ width: '31.7%', paddingHorizontal: 10, paddingVertical: 9 }}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      className="border border-border"
      style={{ width: '31.7%', paddingHorizontal: 10, paddingVertical: 9 }}
    >
      {content}
    </View>
  );
}

export function PoolStatsGrid({
  stats,
  bitcoinPrice,
  networkDifficulty,
  roundWorkEntries = EMPTY_WORK_ENTRIES,
  isLoading = false,
  className = '',
}: PoolStatsGridProps) {
  const { t } = useTranslation();

  const blockUrl = getPoolBlockUrl(stats?.lastBlockTime);
  const poolWork = useMemo(
    () => derivePoolWork(stats?.workSinceLastBlock, roundWorkEntries),
    [stats?.workSinceLastBlock, roundWorkEntries]
  );
  const handleLastBlockPress = useCallback(() => {
    if (!blockUrl) return;
    haptics.light();
    Linking.openURL(blockUrl).catch(() => {});
  }, [blockUrl]);

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
  const poolWorkValue =
    poolWork.value != null
      ? `${poolWork.isLowerBound ? '≥' : ''}${formatDifficulty(poolWork.value)}`
      : '--';

  return (
    <View
      className={`flex-row flex-wrap ${className}`}
      style={{ gap: 8, justifyContent: 'space-between' }}
    >
      <StatBox
        label={t('pool.lastBlock')}
        value={lastBlockHeight ? `#${lastBlockHeight}` : '--'}
        onPress={blockUrl ? handleLastBlockPress : undefined}
      />
      <StatBox
        label={t('pool.avgToFindBlock')}
        value={formatExpectedBlockTime(stats?.hashrate, networkDifficulty)}
      />
      <StatBox
        label={t('pool.btcPrice')}
        value={bitcoinPrice ? `$${formatNumber(bitcoinPrice, 0)}` : '--'}
      />
      <StatBox label={t('pool.poolWork')} value={poolWorkValue} />
      <StatBox
        label={t('pool.highestDiff')}
        value={typeof highestDiff === 'number' ? formatDifficulty(highestDiff) : highestDiff}
      />
      <StatBox
        label={t('pool.minDiffNeeded')}
        value={networkDifficulty ? formatDifficulty(networkDifficulty) : '--'}
      />
    </View>
  );
}
