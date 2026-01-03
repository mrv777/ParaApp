/**
 * PoolSummaryCard - Displays pool stats preview when no address is configured
 */

import { View } from 'react-native';
import { Card } from '../Card';
import { Text } from '../Text';
import { StatItem } from '../StatItem';
import { SkeletonStatItem } from '../SkeletonLoader';
import { formatHashrate, formatNumber } from '@/utils/formatting';
import { useTranslation } from '@/i18n';
import type { PoolStats } from '@/types';

export interface PoolSummaryCardProps {
  stats: PoolStats | null;
  isLoading?: boolean;
  className?: string;
}

export function PoolSummaryCard({ stats, isLoading = false, className = '' }: PoolSummaryCardProps) {
  const { t } = useTranslation();
  const showSkeleton = isLoading && !stats;

  return (
    <Card className={className}>
      <Text variant="subtitle" className="mb-4">
        {t('home.poolOverview')}
      </Text>

      {showSkeleton ? (
        <View className="flex-row justify-between gap-3">
          <View className="flex-1">
            <SkeletonStatItem />
          </View>
          <View className="flex-1">
            <SkeletonStatItem />
          </View>
          <View className="flex-1">
            <SkeletonStatItem />
          </View>
        </View>
      ) : (
        <View className="flex-row justify-between gap-3">
          <View className="flex-1">
            <StatItem
              label={t('home.poolHashrate')}
              value={stats?.hashrate ? formatHashrate(stats.hashrate) : '--'}
              size="sm"
            />
          </View>
          <View className="flex-1">
            <StatItem
              label={t('home.users')}
              value={stats?.users ? formatNumber(stats.users) : '--'}
              size="sm"
            />
          </View>
          <View className="flex-1">
            <StatItem
              label={t('home.workersLabel')}
              value={stats?.workers ? formatNumber(stats.workers) : '--'}
              size="sm"
            />
          </View>
        </View>
      )}
    </Card>
  );
}
