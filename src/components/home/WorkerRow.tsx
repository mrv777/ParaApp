/**
 * WorkerRow - One worker line: status dot + name over a "Best …" sub-line, with
 * hashrate on the right. Online workers read bright; anything not online takes a
 * muted red tint. Used in the home preview and the full workers list.
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
  const isDown = worker.status !== 'online';
  const showLastTime = worker.status === 'offline' || worker.status === 'stale';

  const nameColor = isDown ? colors.dangerTint : colors.textHigh;
  const hashrateColor = isDown ? colors.textMuted : colors.textValue;

  const content = (
    <View
      className={`flex-row items-center justify-between border-t border-border-light ${className}`}
      style={{ paddingVertical: 11 }}
    >
      <View className="flex-row items-center flex-1 mr-2" style={{ gap: 10 }}>
        <WorkerStatusDot status={worker.status} size="md" />
        <View className="flex-1">
          <Text
            variant="mono"
            className="font-bold"
            style={{ fontSize: 14, color: nameColor }}
            numberOfLines={1}
          >
            {worker.name}
          </Text>
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <Text variant="mono" style={{ fontSize: 11, color: colors.textFaint }} numberOfLines={1}>
              {t('home.bestLabel')} {formatDifficulty(worker.bestDifficulty)}
            </Text>
            {showLastTime && (
              <Text variant="mono" style={{ fontSize: 11, color: colors.textFaint }} numberOfLines={1}>
                · {formatTimestamp(worker.lastSubmission)}
              </Text>
            )}
            {note ? (
              <View className="flex-row items-center flex-shrink" style={{ gap: 3 }}>
                <Ionicons name="document-text-outline" size={11} color={colors.textFaint} />
                <Text variant="mono" style={{ fontSize: 11, color: colors.textFaint }} numberOfLines={1}>
                  {note}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <View className="flex-row items-center" style={{ gap: 6 }}>
        <Text variant="mono" style={{ fontSize: 13, color: hashrateColor }}>
          {formatHashrate(worker.hashrate)}
        </Text>
        {onPress && (
          <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
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
