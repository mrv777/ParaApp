/**
 * FleetOverviewCard - Compact card showing aggregate miner swarm stats
 * Tappable to navigate to Miners tab
 */

import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Card } from '../Card';
import { Text } from '../Text';
import { formatHashrate, formatDifficulty } from '@/utils/formatting';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';
import type { FleetStats } from '@/store/minerStore';

export interface FleetOverviewCardProps extends FleetStats {
  onPress: () => void;
}

export function FleetOverviewCard({
  totalHashrate,
  highestDiff,
  warningCount,
  onlineCount,
  totalCount,
  onPress,
}: FleetOverviewCardProps) {
  const { t } = useTranslation();
  const allOffline = totalCount > 0 && onlineCount === 0;

  return (
    <Card onPress={onPress} padding="sm">
      <View className="flex-row items-center justify-between">
        {/* Stats row */}
        <View className="flex-row items-center gap-4 flex-1">
          {/* Swarm icon + label */}
          <View className="flex-row items-center gap-1.5">
            <Ionicons name="hardware-chip-outline" size={16} color={colors.textMuted} />
            <Text variant="caption" color="muted" className="text-xs uppercase">
              {t('home.swarm')}
            </Text>
          </View>

          {/* Total Hashrate */}
          <View className="items-center">
            <Text variant="mono" className="text-sm font-semibold">
              {formatHashrate(totalHashrate * 1e9)}
            </Text>
          </View>

          {/* Divider */}
          <View className="w-px h-4 bg-border" />

          {/* Best Diff */}
          <View className="items-center">
            <Text variant="mono" className="text-sm font-semibold">
              {formatDifficulty(highestDiff)}
            </Text>
          </View>

          {/* Warning count or Online status */}
          {warningCount > 0 ? (
            <>
              <View className="w-px h-4 bg-border" />
              <View className="flex-row items-center gap-1">
                <Ionicons name="warning" size={14} color={colors.warning} />
                <Text variant="mono" color="warning" className="text-sm font-semibold">
                  {warningCount}
                </Text>
              </View>
            </>
          ) : allOffline ? (
            <>
              <View className="w-px h-4 bg-border" />
              <Text variant="caption" color="muted" className="text-xs">
                {t('home.allOffline')}
              </Text>
            </>
          ) : null}
        </View>

        {/* Chevron indicator */}
        <View className="flex-row items-center gap-1">
          <Text variant="caption" color="muted" className="text-xs">
            {onlineCount}/{totalCount}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </View>
      </View>
    </Card>
  );
}
