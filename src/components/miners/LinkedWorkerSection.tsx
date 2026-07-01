/**
 * LinkedWorkerSection - Display linked pool worker stats if stratumUser matches
 * Shows "Not linked" state when no matching worker found
 * Displays multi-miner aggregated stats when multiple miners share same stratumUser
 */

import { useState, useMemo } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../Text';
import { Card } from '../Card';
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

  if (linkedWorker) {
    return (
      <Card padding="none">
        {/* Header: title + worker name + status */}
        <View
          className="flex-row items-center justify-between border-b border-border-light"
          style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 }}
        >
          <View className="flex-row items-center flex-1 mr-2" style={{ gap: 8 }}>
            <Ionicons name="link" size={14} color={colors.textMuted} />
            <Text
              variant="subtitle"
              style={{ fontSize: 15, color: colors.textHigh }}
              numberOfLines={1}
            >
              {linkedWorker.name}
            </Text>
          </View>
          <View className="flex-row items-center" style={{ gap: 5 }}>
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: isOnline ? colors.success : colors.danger,
              }}
            />
            <Text
              variant="mono"
              className="uppercase"
              style={{ fontSize: 9, letterSpacing: 0.5, color: isOnline ? colors.success : colors.danger }}
            >
              {isOnline ? t('common.online') : t('common.offline')}
            </Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}>
          {/* Worker stats */}
          <View className="flex-row" style={{ gap: 16 }}>
            <View className="flex-1">
              <Text
                variant="mono"
                className="uppercase"
                style={{ fontSize: 8, letterSpacing: 0.8, color: colors.textDim }}
              >
                {t('miners.poolHashrate')}
              </Text>
              <Text
                variant="mono"
                className="font-bold"
                style={{ fontSize: 14, marginTop: 4, color: colors.text }}
              >
                {formatHashrate(linkedWorker.hashrate)}
              </Text>
            </View>
            <View className="flex-1">
              <Text
                variant="mono"
                className="uppercase"
                style={{ fontSize: 8, letterSpacing: 0.8, color: colors.textDim }}
              >
                {t('miners.bestDiff')}
              </Text>
              <Text
                variant="mono"
                className="font-bold"
                style={{ fontSize: 14, marginTop: 4, color: colors.text }}
              >
                {formatDifficulty(linkedWorker.bestDifficulty)}
              </Text>
            </View>
          </View>

          {/* Last share */}
          <Text variant="mono" style={{ fontSize: 11, color: colors.textFaint }}>
            {t('miners.lastShare', { time: formatTimestamp(linkedWorker.lastSubmission) })}
          </Text>

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
      </Card>
    );
  }

  /* Not linked state */
  return (
    <Card padding="none">
      <View
        className="flex-row items-center"
        style={{ paddingHorizontal: 16, paddingVertical: 14, gap: 12 }}
      >
        <Ionicons name="unlink" size={18} color={colors.textDisabled} />
        <View className="flex-1">
          <Text variant="mono" style={{ fontSize: 13, color: colors.textMuted }}>
            {t('miners.notLinked')}
          </Text>
          <Text variant="mono" style={{ fontSize: 11, color: colors.textFaint, marginTop: 2 }}>
            {t('miners.workerNotFound', { name: stratumUser })}
          </Text>
        </View>
      </View>
    </Card>
  );
}
