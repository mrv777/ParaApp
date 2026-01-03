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
import { useMinerStore, selectMiners } from '@/store/minerStore';
import type { LocalMiner } from '@/types';
import { formatHashrate, formatDifficulty, formatTimestamp, parseWorkerName } from '@/utils/formatting';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';

// Stable empty array to prevent infinite re-renders
const EMPTY_MINERS: LocalMiner[] = [];

export interface LinkedWorkerSectionProps {
  stratumUser: string;
  currentMinerIp: string;
}

export function LinkedWorkerSection({
  stratumUser,
  currentMinerIp,
}: LinkedWorkerSectionProps) {
  const { t } = useTranslation();
  const workers = useUserStore(selectUserWorkers);
  const allMiners = useMinerStore(selectMiners);
  const linkedMiners = useMemo(
    () =>
      stratumUser
        ? allMiners.filter((m) => m.stratumUser === stratumUser)
        : EMPTY_MINERS,
    [allMiners, stratumUser]
  );

  const [expanded, setExpanded] = useState(false);

  // Find matching worker by parsing worker name from stratum user
  const workerName = parseWorkerName(stratumUser);
  const linkedWorker = workerName
    ? workers.find((w) => w.name === workerName)
    : undefined;

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
          {linkedWorker ? t('miners.linkedWorker') : t('miners.poolWorkerLink')}
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
              {isOnline ? t('common.online') : t('common.offline')}
            </Badge>
          </View>

          {/* Worker stats */}
          <View className="flex-row gap-4">
            <View className="flex-1">
              <Text variant="caption" color="muted" className="mb-1">
                {t('miners.poolHashrate')}
              </Text>
              <Text variant="body" className="font-medium">
                {formatHashrate(linkedWorker.hashrate)}
              </Text>
            </View>
            <View className="flex-1">
              <Text variant="caption" color="muted" className="mb-1">
                {t('miners.bestDiff')}
              </Text>
              <Text variant="body" className="font-medium">
                {formatDifficulty(linkedWorker.bestDifficulty)}
              </Text>
            </View>
          </View>

          {/* Last share */}
          <View className="mt-3 pt-3 border-t border-border">
            <Text variant="caption" color="muted">
              {t('miners.lastShare', { time: formatTimestamp(linkedWorker.lastSubmission) })}
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
              {t('miners.notLinked')}
            </Text>
            <Text variant="caption" color="muted">
              {t('miners.workerNotFound', { name: stratumUser })}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
