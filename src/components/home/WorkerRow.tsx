/**
 * WorkerRow - Expandable row for worker display
 * Used in both WorkersPreviewCard (non-expandable) and WorkersListScreen (expandable)
 */

import { View, Pressable, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../Text';
import { Badge } from '../Badge';
import { WorkerStatusDot } from './WorkerStatusDot';
import { LinkedMinersIndicator } from './LinkedMinersIndicator';
import { LinkedMinersExpandedSection } from './LinkedMinersExpandedSection';
import { formatHashrate, formatDifficulty, formatTimestamp } from '@/utils/formatting';
import { haptics } from '@/utils/haptics';
import { colors } from '@/constants/colors';
import type { UserWorker } from '@/types';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

export interface WorkerRowProps {
  worker: UserWorker;
  expanded?: boolean;
  onToggle?: () => void;
  showExpandButton?: boolean;
  showLinkedMiners?: boolean;
  className?: string;
}

export function WorkerRow({
  worker,
  expanded = false,
  onToggle,
  showExpandButton = false,
  showLinkedMiners = false,
  className = '',
}: WorkerRowProps) {
  const handlePress = () => {
    if (showExpandButton && onToggle) {
      haptics.selection();
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      onToggle();
    }
  };

  const content = (
    <View className={`py-2 ${className}`}>
      {/* Main row */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center flex-1 mr-2 gap-2">
          <WorkerStatusDot status={worker.status} size="sm" />
          <Text variant="body" className="font-medium flex-1" numberOfLines={1}>
            {worker.name}
          </Text>
        </View>
        <View className="flex-row items-center gap-3">
          <View className="items-end">
            <Text variant="mono" className="text-sm">
              {formatHashrate(worker.hashrate)}
            </Text>
          </View>
          {showExpandButton && (
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.textMuted}
            />
          )}
        </View>
      </View>

      {/* Secondary stats row */}
      <View className="flex-row items-center gap-4 mt-1">
        <Text variant="caption" color="muted">
          Best: {formatDifficulty(worker.bestDifficulty)}
        </Text>
        <Text variant="caption" color="muted">
          Last: {formatTimestamp(worker.lastSubmission)}
        </Text>
        {showLinkedMiners && <LinkedMinersIndicator workerName={worker.name} />}
      </View>

      {/* Expanded details */}
      {expanded && (
        <View className="mt-3 pt-3 border-t border-border">
          <Badge
            variant={
              worker.status === 'online'
                ? 'success'
                : worker.status === 'stale'
                  ? 'warning'
                  : 'danger'
            }
            size="sm"
          >
            {worker.status === 'online'
              ? 'Online'
              : worker.status === 'stale'
                ? 'Stale'
                : 'Offline'}
          </Badge>

          {/* Linked miners section */}
          {showLinkedMiners && (
            <LinkedMinersExpandedSection workerName={worker.name} />
          )}
        </View>
      )}
    </View>
  );

  if (showExpandButton) {
    return (
      <Pressable
        onPress={handlePress}
        className="border-b border-border"
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        {content}
      </Pressable>
    );
  }

  return <View className="border-b border-border">{content}</View>;
}
