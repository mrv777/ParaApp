/**
 * WorkersPreviewCard - Shows top workers with "View all" button
 */

import { View } from 'react-native';
import { Card } from '../Card';
import { Text } from '../Text';
import { Button } from '../Button';
import { ConnectionStatus } from '../ConnectionStatus';
import { SkeletonText } from '../SkeletonLoader';
import { WorkerRow } from './WorkerRow';
import { WorkerHealthBadge } from './WorkerHealthBadge';
import { useWorkerHealth } from '@/hooks';
import type { UserWorker } from '@/types';

export interface WorkersPreviewCardProps {
  workers?: UserWorker[];
  maxItems?: number;
  onViewAll: () => void;
  isLoading?: boolean;
  connectionStatus?: 'connected' | 'connecting' | 'offline';
  className?: string;
}

export function WorkersPreviewCard({
  workers = [],
  maxItems = 5,
  onViewAll,
  isLoading = false,
  connectionStatus = 'connected',
  className = '',
}: WorkersPreviewCardProps) {
  const safeWorkers = Array.isArray(workers) ? workers : [];
  const displayWorkers = safeWorkers.slice(0, maxItems);
  const showSkeleton = isLoading && safeWorkers.length === 0;
  const healthSummary = useWorkerHealth(safeWorkers);

  return (
    <Card padding="none" className={className}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-3 pt-3 pb-1">
        <View className="flex-row items-center gap-2">
          <Text variant="subtitle" className="text-base">Workers</Text>
          <WorkerHealthBadge summary={healthSummary} />
        </View>
        <ConnectionStatus status={connectionStatus} />
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
              No workers found
            </Text>
            <Text variant="caption" color="muted" className="mt-1">
              Workers will appear once they submit shares
            </Text>
          </View>
        ) : (
          displayWorkers.map((worker) => (
            <WorkerRow
              key={worker.name}
              worker={worker}
              showExpandButton={false}
            />
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
            View all workers ({safeWorkers.length})
          </Button>
        </View>
      )}
    </Card>
  );
}
