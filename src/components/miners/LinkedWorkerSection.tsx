/**
 * LinkedWorkerSection - Display linked pool worker stats if stratumUser matches
 * Shows "Not linked" state when no matching worker found
 * Displays multi-miner aggregated stats when multiple miners share same stratumUser
 */

import { useState, useMemo } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../Text';
import { Badge } from '../Badge';
import { MultiMinerSection } from './MultiMinerSection';
import { useUserStore, selectUserWorkers } from '@/store/userStore';
import { useMinerStore, selectMinersByStratumUser } from '@/store/minerStore';
import { formatHashrate, formatDifficulty, formatTimestamp } from '@/utils/formatting';
import { colors } from '@/constants/colors';

export interface LinkedWorkerSectionProps {
  stratumUser: string;
  currentMinerIp: string;
}

export function LinkedWorkerSection({
  stratumUser,
  currentMinerIp,
}: LinkedWorkerSectionProps) {
  const workers = useUserStore(selectUserWorkers);
  const selectMiners = useMemo(
    () => selectMinersByStratumUser(stratumUser),
    [stratumUser]
  );
  const linkedMiners = useMinerStore(selectMiners);

  const [expanded, setExpanded] = useState(false);

  // Find matching worker
  const linkedWorker = workers.find((w) => w.name === stratumUser);

  // Sibling miners (excluding current)
  const siblingMiners = linkedMiners.filter((m) => m.ip !== currentMinerIp);
  const hasMultipleMiners = siblingMiners.length > 0;

  // No stratumUser configured - nothing to link
  if (!stratumUser) {
    return null;
  }

  const isOnline = linkedWorker?.status === 'online';

  return (
    <View className="px-4 mb-4">
      <View className="flex-row items-center gap-2 mb-2">
        <Ionicons
          name={linkedWorker ? 'link' : 'unlink'}
          size={14}
          color={linkedWorker ? colors.textMuted : colors.textDisabled}
        />
        <Text variant="caption" color="muted" className="uppercase">
          {linkedWorker ? 'Linked Pool Worker' : 'Pool Worker Link'}
        </Text>
      </View>

      {linkedWorker ? (
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

          {/* Multi-miner section (when >1 miner shares this worker) */}
          {hasMultipleMiners && (
            <MultiMinerSection
              miners={linkedMiners}
              currentMinerIp={currentMinerIp}
              expanded={expanded}
              onToggle={() => setExpanded(!expanded)}
            />
          )}
        </View>
      ) : (
        /* Not linked state */
        <View className="bg-secondary rounded-lg p-3 flex-row items-center gap-3">
          <Ionicons name="unlink" size={18} color={colors.textDisabled} />
          <View className="flex-1">
            <Text variant="body" color="muted">
              Not linked to pool
            </Text>
            <Text variant="caption" color="muted">
              Worker &quot;{stratumUser}&quot; not found on this address
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
