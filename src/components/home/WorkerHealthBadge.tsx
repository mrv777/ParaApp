/**
 * WorkerHealthBadge - Aggregate health indicator for workers
 * Shows counts of offline/stale workers, or single green dot if all healthy
 */

import { View } from 'react-native';
import { Text } from '../Text';
import { colors } from '@/constants/colors';
import type { WorkerHealthSummary } from '@/types';

export interface WorkerHealthBadgeProps {
  summary: WorkerHealthSummary;
  className?: string;
}

export function WorkerHealthBadge({
  summary,
  className = '',
}: WorkerHealthBadgeProps) {
  // Don't render anything if no workers
  if (summary.total === 0) {
    return null;
  }

  const hasIssues = summary.offline > 0 || summary.stale > 0;

  // If all healthy, show single green dot
  if (!hasIssues) {
    return (
      <View className={`flex-row items-center ${className}`}>
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: colors.success,
          }}
        />
      </View>
    );
  }

  // Show count badges for issues
  return (
    <View className={`flex-row items-center gap-2 ${className}`}>
      {summary.stale > 0 && (
        <View className="flex-row items-center gap-1">
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: colors.warning,
            }}
          />
          <Text variant="caption" style={{ color: colors.warning }}>
            {summary.stale}
          </Text>
        </View>
      )}
      {summary.offline > 0 && (
        <View className="flex-row items-center gap-1">
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: colors.danger,
            }}
          />
          <Text variant="caption" style={{ color: colors.danger }}>
            {summary.offline}
          </Text>
        </View>
      )}
    </View>
  );
}
