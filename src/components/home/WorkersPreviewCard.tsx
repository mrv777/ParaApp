/**
 * WorkersPreviewCard - Shows top workers with "View all" button
 */

import { useMemo } from 'react';
import { View } from 'react-native';
import { Card } from '../Card';
import { Text } from '../Text';
import { Button } from '../Button';
import { SkeletonText } from '../SkeletonLoader';
import { WorkerRow } from './WorkerRow';
import { WorkerHealthBadge } from './WorkerHealthBadge';
import { useWorkerHealth } from '@/hooks';
import { useTranslation } from '@/i18n';
import { formatHashrate } from '@/utils/formatting';
import type { UserWorker } from '@/types';

const EMPTY_NOTES: Record<string, string> = {};

export interface WorkersPreviewCardProps {
  workers?: UserWorker[];
  workerNotes?: Record<string, string>;
  maxItems?: number;
  onViewAll: () => void;
  isLoading?: boolean;
  className?: string;
}

export function WorkersPreviewCard({
  workers = [],
  workerNotes = EMPTY_NOTES,
  maxItems = 5,
  onViewAll,
  isLoading = false,
  className = '',
}: WorkersPreviewCardProps) {
  const { t } = useTranslation();
  const safeWorkers = Array.isArray(workers) ? workers : [];
  const displayWorkers = safeWorkers.slice(0, maxItems);
  const showSkeleton = isLoading && safeWorkers.length === 0;
  const healthSummary = useWorkerHealth(safeWorkers);
  const totalHashrate = useMemo(
    () => safeWorkers.reduce((sum, w) => sum + w.hashrate, 0),
    [safeWorkers]
  );

  return (
    <Card padding="none" className={className}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-3 pt-3 pb-1">
        <View className="flex-row items-center gap-2">
          <Text variant="subtitle" className="text-base">{t('home.workers')}</Text>
          <WorkerHealthBadge summary={healthSummary} />
        </View>
        {totalHashrate > 0 && (
          <Text variant="mono" className="text-sm">
            {formatHashrate(totalHashrate)}
          </Text>
        )}
      </View>

      {/* Workers list */}
      <View className="px-3">
        {showSkeleton ? (
          <View className="py-4 gap-4">
            {[1, 2, 3].map((i) => (
              <View key={i} className="gap-2">
                <SkeletonText lines={1} />
                <SkeletonText lines={1} />
              </View>
            ))}
          </View>
        ) : safeWorkers.length === 0 ? (
          <View className="py-8 items-center">
            <Text variant="body" color="muted">
              {t('home.noWorkersFound')}
            </Text>
            <Text variant="caption" color="muted" className="mt-1">
              {t('home.workersAppearHint')}
            </Text>
          </View>
        ) : (
          displayWorkers.map((worker) => (
            <WorkerRow key={worker.name} worker={worker} note={workerNotes[worker.name]} />
          ))
        )}
      </View>

      {/* Footer with View All button */}
      {safeWorkers.length > 0 && (
        <View className="px-3 pb-3 pt-1">
          <Button
            variant="ghost"
            icon="list-outline"
            iconPosition="left"
            onPress={onViewAll}
          >
            {t('home.viewAllWorkersCount', { count: safeWorkers.length })}
          </Button>
        </View>
      )}
    </Card>
  );
}
