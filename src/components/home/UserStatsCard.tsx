/**
 * UserStatsCard - The "Mining Stats" card: wallet header + share, a live hero
 * hashrate with a 1h/24h/7d/30d segmented control, three sub-stats, the
 * embedded 24h-style hashrate chart with axis labels, and a badges footer that
 * opens the achievements sheet. Terminal/brutalist styling.
 */

import { useMemo, type ReactNode } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../Card';
import { Text } from '../Text';
import { SkeletonStatItem } from '../SkeletonLoader';
import {
  getDifficultyHitPosition,
  getHighestDifficultyHit,
  selectVisibleDifficultyHits,
  TimePresetButtons,
  UserHashrateChart,
} from '../charts';
import { formatXAxisLabel } from '../charts/chart-utils';
import { BadgeMedal } from './BadgeMedals';
import { formatDifficulty, formatHashrate, truncateAddress } from '@/utils/formatting';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';
import { buildBadgeMedals, extractBadgeCounts } from '@/types';
import type {
  UserStats,
  UserDifficultyHit,
  UserHistoricalPoint,
  BadgesPayload,
  HistoricalPeriod,
} from '@/types';

const CHART_HEIGHT = 96;
const EMPTY_HISTORY: UserHistoricalPoint[] = [];
const EMPTY_DIFFICULTY_HITS: UserDifficultyHit[] = [];

export interface UserStatsCardProps {
  stats: UserStats | null;
  walletAddress?: string;
  period: HistoricalPeriod;
  historical?: UserHistoricalPoint[];
  difficultyHits?: UserDifficultyHit[];
  onPeriodChange: (period: HistoricalPeriod) => void;
  isLoadingHistorical?: boolean;
  onChartPress?: () => void;
  badges?: BadgesPayload | null;
  onBadgesPress?: () => void;
  isLoading?: boolean;
  className?: string;
  onShare?: () => void;
  isSharing?: boolean;
}

/** Split "6.11 PH/s" into ["6.11", "PH/s"]. */
function splitHashrate(value: string): [string, string] {
  const idx = value.indexOf(' ');
  if (idx === -1) return [value, ''];
  return [value.slice(0, idx), value.slice(idx + 1)];
}

function SubStat({ label, value }: { label: string; value: string }) {
  return (
    <Text variant="mono" style={{ fontSize: 12, color: colors.textMuted }}>
      {label}{' '}
      <Text variant="mono" style={{ fontSize: 12, color: colors.textValue }}>
        {value}
      </Text>
    </Text>
  );
}

export function UserStatsCard({
  stats,
  walletAddress = '',
  period,
  historical = EMPTY_HISTORY,
  difficultyHits = EMPTY_DIFFICULTY_HITS,
  onPeriodChange,
  isLoadingHistorical = false,
  onChartPress,
  badges = null,
  onBadgesPress,
  isLoading = false,
  className = '',
  onShare,
  isSharing = false,
}: UserStatsCardProps) {
  const { t } = useTranslation();
  const showSkeleton = isLoading && !stats;

  const [heroValue, heroUnit] = stats?.hashrate
    ? splitHashrate(formatHashrate(stats.hashrate))
    : ['--', ''];

  // Three evenly-spaced axis labels (start / middle / end) from the series.
  const axisLabels = useMemo<string[]>(() => {
    if (!historical || historical.length === 0) return [];
    const first = historical[0];
    const mid = historical[Math.floor(historical.length / 2)];
    const last = historical[historical.length - 1];
    return [first, mid, last].map((p) => formatXAxisLabel(p.timestamp, period));
  }, [historical, period]);
  const compactDifficultyHit = useMemo(() => {
    const hit = getHighestDifficultyHit(
      selectVisibleDifficultyHits(difficultyHits, historical, period)
    );
    if (!hit) return null;

    const position = getDifficultyHitPosition(hit, historical);
    return position === null ? null : { hit, position };
  }, [difficultyHits, historical, period]);

  // Badge avatars (real medals) + total count for the footer. Total = number
  // of rendered medals in the achievements sheet (stacked kinds count once).
  const { totalBadges, avatarMedals } = useMemo(() => {
    const descriptors = buildBadgeMedals(extractBadgeCounts(badges));
    const medals: ReactNode[] = descriptors
      .slice(0, 3)
      .map((d) => <BadgeMedal key={d.key} descriptor={d} size={20} />);
    return { totalBadges: descriptors.length, avatarMedals: medals };
  }, [badges]);
  const overflow = totalBadges - avatarMedals.length;

  return (
    <Card padding="none" className={className}>
      {/* Header: wallet address + share */}
      <View
        className="flex-row items-center justify-between"
        style={{ paddingHorizontal: 16, paddingTop: 12 }}
      >
        <Text
          variant="mono"
          style={{ fontSize: 12, letterSpacing: 0.72, color: colors.textSecondary }}
          numberOfLines={1}
        >
          {walletAddress ? truncateAddress(walletAddress, 5) : t('home.miningStats')}
        </Text>
        {onShare && (
          <Pressable
            onPress={onShare}
            disabled={isSharing || showSkeleton}
            hitSlop={8}
            className="active:opacity-60"
            style={{ padding: 2 }}
          >
            {isSharing ? (
              <ActivityIndicator size="small" color={colors.textMuted} />
            ) : (
              <Ionicons
                name="share-outline"
                size={16}
                color={showSkeleton ? colors.textDisabled : colors.textMuted}
              />
            )}
          </Pressable>
        )}
      </View>

      {/* Body */}
      <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
        {/* Label + segmented control */}
        <View className="flex-row items-center justify-between">
          <Text
            variant="caption"
            className="uppercase"
            style={{ fontSize: 10, letterSpacing: 1.6, color: colors.textDim }}
          >
            {t('home.currentHashrate')}
          </Text>
          <TimePresetButtons
            selected={period}
            onSelect={onPeriodChange}
            disabled={isLoadingHistorical}
          />
        </View>

        {showSkeleton ? (
          <View style={{ marginTop: 8, gap: 12 }}>
            <SkeletonStatItem />
            <SkeletonStatItem />
          </View>
        ) : (
          <>
            {/* Hero (live current hashrate) */}
            <View className="flex-row items-baseline" style={{ marginTop: 6, gap: 12 }}>
              <Text
                variant="mono"
                className="font-bold text-foreground"
                style={{ fontSize: 44, lineHeight: 53 }}
              >
                {heroValue}
              </Text>
              {heroUnit ? (
                <Text variant="mono" style={{ fontSize: 19, color: '#b4b4b6' }}>
                  {heroUnit}
                </Text>
              ) : null}
            </View>

            {/* Sub-stats */}
            <View className="flex-row flex-wrap" style={{ marginTop: 8, gap: 16 }}>
              <SubStat
                label={t('home.oneHourShort')}
                value={stats?.hashrate1h ? formatHashrate(stats.hashrate1h) : '--'}
              />
              <SubStat
                label={t('home.oneDayShort')}
                value={stats?.hashrate24h ? formatHashrate(stats.hashrate24h) : '--'}
              />
              <SubStat label={t('home.bestShort')} value={stats?.bestDifficultyFormatted || '--'} />
            </View>
          </>
        )}

        {/* Chart — a sparkline; tap anywhere opens the full-screen interactive
            chart. pointerEvents="none" lets the tap fall through to the Pressable
            (and keeps the embedded chart from showing its own clipped tooltip). */}
        {compactDifficultyHit ? (
          <View className="flex-row items-center justify-end" style={{ marginTop: 10, gap: 5 }}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: colors.chartDifficulty,
              }}
            />
            <Text variant="caption" style={{ color: colors.textFaint, fontSize: 9 }}>
              {t('home.bestDiff')} {formatDifficulty(compactDifficultyHit.hit.difficulty)} ·{' '}
              {t('home.tapToExpand')}
            </Text>
          </View>
        ) : null}
        <Pressable onPress={onChartPress} style={{ marginTop: compactDifficultyHit ? 4 : 12 }}>
          <View pointerEvents="none" style={{ position: 'relative' }}>
            <UserHashrateChart
              data={historical}
              period={period}
              isLoading={isLoadingHistorical}
              height={CHART_HEIGHT}
              variant="embedded"
            />
            {compactDifficultyHit ? (
              <View
                style={{
                  position: 'absolute',
                  left: `${compactDifficultyHit.position * 100}%`,
                  bottom: 7,
                  width: 2,
                  height: 14,
                  transform: [{ translateX: -1 }],
                  backgroundColor: colors.chartDifficulty,
                }}
              >
                <View
                  style={{
                    position: 'absolute',
                    left: -3,
                    top: -4,
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: colors.chartDifficulty,
                  }}
                />
              </View>
            ) : null}
          </View>
        </Pressable>

        {/* Axis labels */}
        {axisLabels.length === 3 && (
          <View className="flex-row justify-between" style={{ paddingBottom: 12, marginTop: 2 }}>
            {axisLabels.map((label, i) => (
              <Text key={i} variant="mono" style={{ fontSize: 10, color: colors.textFaint }}>
                {label}
              </Text>
            ))}
          </View>
        )}
      </View>

      {/* Badges footer */}
      {totalBadges > 0 && (
        <Pressable
          onPress={onBadgesPress}
          className="flex-row items-center justify-between border-t border-border-light active:opacity-60"
          style={{ paddingHorizontal: 16, paddingVertical: 11 }}
        >
          <View className="flex-row items-center" style={{ gap: 9 }}>
            <Text
              variant="caption"
              className="uppercase"
              style={{ fontSize: 11, letterSpacing: 1.32, color: colors.textMuted }}
            >
              {t('home.badgesCount', { count: totalBadges })}
            </Text>
            <View className="flex-row items-center">
              {avatarMedals.map((medal, i) => (
                <View key={i} style={{ marginLeft: i === 0 ? 0 : -6 }}>
                  {medal}
                </View>
              ))}
              {overflow > 0 && (
                <View
                  className="items-center justify-center rounded-full"
                  style={{
                    width: 20,
                    height: 20,
                    marginLeft: -6,
                    backgroundColor: '#111111',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.4)',
                  }}
                >
                  <Text variant="mono" style={{ fontSize: 8, color: '#b4b4b6' }}>
                    +{overflow}
                  </Text>
                </View>
              )}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
        </Pressable>
      )}
    </Card>
  );
}
