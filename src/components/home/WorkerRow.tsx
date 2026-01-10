/**
 * WorkerRow - Simple row for worker display
 * Shows worker name, status, hashrate, best difficulty, last submission, and optional note
 */

import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../Text';
import { WorkerStatusDot } from './WorkerStatusDot';
import { formatHashrate, formatDifficulty, formatTimestamp } from '@/utils/formatting';
import { useTranslation } from '@/i18n';
import { colors } from '@/constants/colors';
import type { UserWorker } from '@/types';

export interface WorkerRowProps {
  worker: UserWorker;
  note?: string;
  onPress?: () => void;
  className?: string;
}

export function WorkerRow({ worker, note, onPress, className = '' }: WorkerRowProps) {
  const { t } = useTranslation();
  const showLastTime = worker.status === 'offline' || worker.status === 'stale';

  const content = (
    <View className={`py-2 border-b border-border ${className}`}>
      {/* Main row */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center flex-1 mr-2 gap-2">
          <WorkerStatusDot status={worker.status} size="sm" />
          <Text variant="body" className="font-medium flex-1" numberOfLines={1}>
            {worker.name}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Text variant="mono" className="text-sm">
            {formatHashrate(worker.hashrate)}
          </Text>
          {onPress && (
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          )}
        </View>
      </View>

      {/* Secondary stats row */}
      <View className="flex-row items-center justify-between mt-1">
        <View className="flex-row items-center gap-4">
          <Text variant="caption" color="muted">
            {t('home.bestLabel')}: {formatDifficulty(worker.bestDifficulty)}
          </Text>
          {showLastTime && (
            <Text variant="caption" color="muted">
              {t('home.lastLabel')}: {formatTimestamp(worker.lastSubmission)}
            </Text>
          )}
        </View>
        {note && (
          <View className="flex-row items-center gap-1 flex-shrink ml-2">
            <Ionicons name="document-text-outline" size={12} color={colors.textMuted} />
            <Text variant="caption" color="muted" numberOfLines={1}>
              {note}
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
        {content}
      </Pressable>
    );
  }

  return content;
}
