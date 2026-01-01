/**
 * LinkedWorkerSection - Display linked pool worker stats if stratumUser matches
 */

import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../Text';
import { Badge } from '../Badge';
import { useUserStore, selectUserWorkers } from '@/store/userStore';
import { formatHashrate, formatDifficulty, formatTimestamp } from '@/utils/formatting';
import { colors } from '@/constants/colors';

export interface LinkedWorkerSectionProps {
  stratumUser: string;
}

export function LinkedWorkerSection({ stratumUser }: LinkedWorkerSectionProps) {
  const workers = useUserStore(selectUserWorkers);

  // Find matching worker
  const linkedWorker = workers.find((w) => w.name === stratumUser);

  // Don't render if no stratumUser or no matching worker
  if (!stratumUser || !linkedWorker) {
    return null;
  }

  const isOnline = linkedWorker.status === 'online';

  return (
    <View className="px-4 mb-4">
      <View className="flex-row items-center gap-2 mb-2">
        <Ionicons name="link" size={14} color={colors.textMuted} />
        <Text variant="caption" color="muted" className="uppercase">
          Linked Pool Worker
        </Text>
      </View>
      <View className="bg-secondary rounded-lg p-4">
        {/* Worker name and status */}
        <View className="flex-row items-center justify-between mb-3">
          <Text variant="body" className="font-medium">
            {linkedWorker.name}
          </Text>
          <Badge variant={isOnline ? 'success' : 'danger'} size="sm">
            {isOnline ? 'Online' : 'Offline'}
          </Badge>
        </View>

        {/* Worker stats */}
        <View className="flex-row gap-4">
          <View className="flex-1">
            <Text variant="caption" color="muted" className="mb-1">
              Pool Hashrate
            </Text>
            <Text variant="body" className="font-medium">
              {formatHashrate(linkedWorker.hashrate)}
            </Text>
          </View>
          <View className="flex-1">
            <Text variant="caption" color="muted" className="mb-1">
              Best Diff
            </Text>
            <Text variant="body" className="font-medium">
              {formatDifficulty(linkedWorker.bestDifficulty)}
            </Text>
          </View>
        </View>

        {/* Last share */}
        <View className="mt-3 pt-3 border-t border-border">
          <Text variant="caption" color="muted">
            Last share: {formatTimestamp(linkedWorker.lastSubmission)}
          </Text>
        </View>
      </View>
    </View>
  );
}
