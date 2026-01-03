/**
 * WorkerRow - Simple row for worker display
 * Shows worker name, status, hashrate, best difficulty, and last submission
 */

import { View } from 'react-native';
import { Text } from '../Text';
import { WorkerStatusDot } from './WorkerStatusDot';
import { formatHashrate, formatDifficulty, formatTimestamp } from '@/utils/formatting';
import { useTranslation } from '@/i18n';
import type { UserWorker } from '@/types';

export interface WorkerRowProps {
  worker: UserWorker;
  className?: string;
}

export function WorkerRow({ worker, className = '' }: WorkerRowProps) {
  const { t } = useTranslation();

  return (
    <View className={`py-2 border-b border-border ${className}`}>
      {/* Main row */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center flex-1 mr-2 gap-2">
          <WorkerStatusDot status={worker.status} size="sm" />
          <Text variant="body" className="font-medium flex-1" numberOfLines={1}>
            {worker.name}
          </Text>
        </View>
        <View className="items-end">
          <Text variant="mono" className="text-sm">
            {formatHashrate(worker.hashrate)}
          </Text>
        </View>
      </View>

      {/* Secondary stats row */}
      <View className="flex-row items-center gap-4 mt-1">
        <Text variant="caption" color="muted">
          {t('home.bestLabel')}: {formatDifficulty(worker.bestDifficulty)}
        </Text>
        <Text variant="caption" color="muted">
          {t('home.lastLabel')}: {formatTimestamp(worker.lastSubmission)}
        </Text>
      </View>
    </View>
  );
}
