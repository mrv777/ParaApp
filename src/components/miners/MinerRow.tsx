/**
 * MinerRow - List item for a Bitaxe miner with swipe-to-delete
 * Shows hostname/alias, hashrate, temperature, and status
 */

import { View, Pressable } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../Text';
import { Badge } from '../Badge';
import {
  formatHashrate,
  formatTemperature,
  formatDifficulty,
} from '@/utils/formatting';
import { haptics } from '@/utils/haptics';
import { colors } from '@/constants/colors';
import { tempThresholds } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import type { LocalMiner, MinerWarning, MinerWarningType } from '@/types';

/**
 * Get translation key for warning type
 */
function getWarningKey(type: MinerWarningType): string {
  const keys: Record<MinerWarningType, string> = {
    temp_caution: 'warnings.warm',
    temp_danger: 'warnings.hot',
    overheat: 'warnings.overheatLabel',
    power_fault: 'warnings.powerLabel',
    low_hashrate: 'warnings.lowHrLabel',
    offline: 'warnings.offlineLabel',
  };
  return keys[type] || type;
}

export interface MinerRowProps {
  miner: LocalMiner;
  warnings?: MinerWarning[];
  onPress?: () => void;
  onDelete: () => void;
  isLoading?: boolean;
  className?: string;
}

export function MinerRow({
  miner,
  warnings,
  onPress,
  onDelete,
  isLoading = false,
  className = '',
}: MinerRowProps) {
  const { t } = useTranslation();
  const displayName = miner.alias || miner.hostname || miner.ip;

  // Determine temperature warning level
  const getTempColor = (): 'default' | 'warning' | 'danger' => {
    if (!miner.isOnline) return 'default';
    if (miner.temp >= tempThresholds.danger) return 'danger';
    if (miner.temp >= tempThresholds.caution) return 'warning';
    return 'default';
  };

  const tempColor = getTempColor();

  const handlePress = () => {
    if (onPress) {
      haptics.light();
      onPress();
    }
  };

  const handleDelete = () => {
    haptics.warning();
    onDelete();
  };

  const renderRightActions = () => (
    <Pressable
      onPress={handleDelete}
      className="bg-danger justify-center items-center px-6"
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
    >
      <Ionicons name="trash-outline" size={22} color="#fff" />
      <Text className="text-white text-xs mt-1">{t('common.delete')}</Text>
    </Pressable>
  );

  const content = (
    <View
      className={`px-4 py-3 bg-background flex-row items-center ${className}`}
    >
      {/* Status indicator */}
      <View
        className={`w-2 h-2 rounded-full mr-3 ${
          miner.isOnline ? 'bg-success' : 'bg-danger'
        }`}
      />

      {/* Main content */}
      <View className="flex-1 mr-3">
        {/* Name and model */}
        <View className="flex-row items-center gap-2">
          <Text variant="body" className="font-medium" numberOfLines={1}>
            {displayName}
          </Text>
          {miner.deviceModel && miner.deviceModel !== 'Unknown' && (
            <Badge variant="default" size="sm">
              {miner.deviceModel}
            </Badge>
          )}
        </View>

        {/* Warning badges */}
        {warnings && warnings.length > 0 && (
          <View className="flex-row gap-1 mt-1">
            {warnings.slice(0, 2).map((w, i) => (
              <Badge
                key={i}
                variant={w.severity === 'danger' ? 'danger' : 'warning'}
                size="sm"
              >
                {t(getWarningKey(w.type))}
              </Badge>
            ))}
            {warnings.length > 2 && (
              <Badge variant="default" size="sm">
                +{warnings.length - 2}
              </Badge>
            )}
          </View>
        )}

        {/* Stats row */}
        {miner.isOnline ? (
          <View className="flex-row items-center gap-4 mt-1">
            <Text variant="caption" color="muted">
              {miner.ip}
            </Text>
            <Text variant="caption" color="muted">
              {formatHashrate(miner.hashRate * 1e9)}
            </Text>
            <Text variant="caption" color="muted">
              {formatDifficulty(miner.bestDiff)}
            </Text>
            <Text variant="caption" color={tempColor}>
              {formatTemperature(miner.temp)}
            </Text>
          </View>
        ) : isLoading ? (
          <View className="flex-row items-center gap-4 mt-1">
            <Text variant="caption" color="muted">
              {miner.ip}
            </Text>
            <Text variant="caption" color="muted">
              {t('miners.connecting')}
            </Text>
          </View>
        ) : (
          <View className="flex-row items-center gap-4 mt-1">
            <Text variant="caption" color="muted">
              {miner.ip}
            </Text>
            <Text variant="caption" color="muted">
              {t('common.offline')}
            </Text>
          </View>
        )}
      </View>

      {/* Chevron for navigation */}
      {onPress && (
        <Ionicons
          name="chevron-forward"
          size={18}
          color={colors.textMuted}
        />
      )}
    </View>
  );

  if (onPress) {
    return (
      <Swipeable
        renderRightActions={renderRightActions}
        rightThreshold={40}
        enabled={!isLoading}
      >
        <Pressable
          onPress={handlePress}
          disabled={isLoading}
          className="border-b border-border"
          style={({ pressed }) => ({
            opacity: pressed ? 0.7 : isLoading ? 0.5 : 1,
          })}
        >
          {content}
        </Pressable>
      </Swipeable>
    );
  }

  return (
    <Swipeable
      renderRightActions={renderRightActions}
      rightThreshold={40}
      enabled={!isLoading}
    >
      <View
        className="border-b border-border"
        style={{ opacity: isLoading ? 0.5 : 1 }}
      >
        {content}
      </View>
    </Swipeable>
  );
}
