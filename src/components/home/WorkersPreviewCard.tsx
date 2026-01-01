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
import type { UserWorker } from '@/types';

export interface WorkersPreviewCardProps {
  workers: UserWorker[];
  maxItems?: number;
  onViewAll: () => void;
  isLoading?: boolean;
  connectionStatus?: 'connected' | 'connecting' | 'offline';
  className?: string;
}

export function WorkersPreviewCard({
  workers,
  maxItems = 5,
  onViewAll,
  isLoading = false,
  connectionStatus = 'connected',
  className = '',
}: WorkersPreviewCardProps) {
  const displayWorkers = workers.slice(0, maxItems);
  const showSkeleton = isLoading && workers.length === 0;

  return (
    <Card padding="none" className={className}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
        <Text variant="subtitle">Workers</Text>
        <ConnectionStatus status={connectionStatus} />
      </View>

      {/* Workers list */}
      <View className="px-4">
        {showSkeleton ? (
          <View className="py-4 gap-4">
            {[1, 2, 3].map((i) => (
              <View key={i} className="gap-2">
                <SkeletonText lines={1} />
                <SkeletonText lines={1} />
              </View>
            ))}
          </View>
        ) : workers.length === 0 ? (
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
      {workers.length > 0 && (
        <View className="px-4 pb-4 pt-2">
          <Button
            variant="ghost"
            icon="list-outline"
            iconPosition="left"
            onPress={onViewAll}
          >
            View all workers ({workers.length})
          </Button>
        </View>
      )}
    </Card>
  );
}
