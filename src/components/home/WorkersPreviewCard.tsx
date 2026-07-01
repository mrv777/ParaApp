/**
 * WorkersPreviewCard - Top workers with an up/down summary, total hashrate, and
 * a "View all workers (N)" footer. Terminal/brutalist styling; scales from a
 * single worker to 25+ by showing the top rows plus the footer affordance.
 */

import { useMemo } from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../Card';
import { Text } from '../Text';
import { SkeletonText } from '../SkeletonLoader';
import { WorkerRow } from './WorkerRow';
import { useWorkerHealth } from '@/hooks';
import { useTranslation } from '@/i18n';
import { formatHashrate } from '@/utils/formatting';
import { colors } from '@/constants/colors';
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

/** "● N up · ● N down" summary with green/red status dots. */
function StatusSummary({ up, down }: { up: number; down: number }) {
  return (
    <View className="flex-row items-center" style={{ gap: 4 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success }} />
      <Text variant="mono" style={{ fontSize: 11, color: colors.textMuted }}>
        {up} up
      </Text>
      <Text variant="mono" style={{ fontSize: 11, color: colors.textMuted }}>
        ·
      </Text>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.danger }} />
      <Text variant="mono" style={{ fontSize: 11, color: colors.textMuted }}>
        {down} down
      </Text>
    </View>
  );
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
  const health = useWorkerHealth(safeWorkers);
  const totalHashrate = useMemo(
    () => safeWorkers.reduce((sum, w) => sum + w.hashrate, 0),
    [safeWorkers]
  );

  return (
    <Card padding="none" className={className}>
      {/* Header */}
      <View
        className="flex-row items-center justify-between"
        style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 }}
      >
        <View className="flex-row items-center" style={{ gap: 10 }}>
          <Text variant="subtitle" style={{ fontSize: 15, color: colors.textHigh }}>
            {t('home.workers')}
          </Text>
          {safeWorkers.length > 0 && (
            <StatusSummary up={health.online} down={health.stale + health.offline} />
          )}
        </View>
        {totalHashrate > 0 && (
          <Text
            variant="mono"
            className="font-bold text-foreground"
            style={{ fontSize: 13 }}
          >
            {formatHashrate(totalHashrate)}
          </Text>
        )}
      </View>

      {/* Workers list */}
      <View style={{ paddingHorizontal: 16 }}>
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

      {/* Footer */}
      {safeWorkers.length > 0 && (
        <Pressable
          onPress={onViewAll}
          className="flex-row items-center justify-center border-t border-border-light active:opacity-60"
          style={{ paddingVertical: 13, gap: 7 }}
        >
          <Ionicons name="menu" size={16} color="#b4b4b6" />
          <Text variant="mono" style={{ fontSize: 13, color: '#b4b4b6' }}>
            {t('home.viewAllWorkersCount', { count: safeWorkers.length })}
          </Text>
        </Pressable>
      )}
    </Card>
  );
}
