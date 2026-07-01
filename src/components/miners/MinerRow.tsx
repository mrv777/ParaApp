/**
 * MinerRow - List item for a local miner with swipe-to-delete
 * Shows hostname/alias, hashrate, temperature, and status
 */

import { View, Pressable } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../Text';
import {
  formatHashrate,
  formatTemperature,
  formatDifficulty,
} from '@/utils/formatting';
import { haptics } from '@/utils/haptics';
import { colors } from '@/constants/colors';
import { getTempThresholdsFor } from '@/constants/theme';
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

  const nameColor = miner.isOnline ? colors.textHigh : colors.dangerTint;
  const hasModel = miner.deviceModel && miner.deviceModel !== 'Unknown';

  // Determine temperature warning color (from the fine-grained ramp)
  const tempColor = (() => {
    if (!miner.isOnline) return colors.textFaint;
    const th = getTempThresholdsFor(miner.minerType);
    if (miner.temp >= th.danger) return colors.danger;
    if (miner.temp >= th.caution) return colors.warning;
    return colors.textFaint;
  })();

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
      className={`bg-background flex-row items-center ${className}`}
      style={{ paddingHorizontal: 16, paddingVertical: 12 }}
    >
      {/* Status indicator */}
      <View
        className={`w-2 h-2 rounded-full mr-3 ${
          miner.isOnline ? 'bg-success' : 'bg-danger'
        }`}
      />

      {/* Main content */}
      <View className="flex-1 mr-2">
        {/* Name */}
        <Text
          variant="mono"
          className="font-bold"
          style={{ fontSize: 14, color: nameColor }}
          numberOfLines={1}
        >
          {displayName}
        </Text>

        {/* Meta line: model · ip · diff · temp (or offline/connecting) */}
        <View className="flex-row items-center" style={{ gap: 8, marginTop: 2 }}>
          {hasModel && (
            <Text variant="mono" style={{ fontSize: 11, color: colors.textFaint }} numberOfLines={1}>
              {miner.deviceModel}
            </Text>
          )}
          <Text variant="mono" style={{ fontSize: 11, color: colors.textFaint }} numberOfLines={1}>
            {miner.ip}
          </Text>
          {miner.isOnline ? (
            <>
              <Text variant="mono" style={{ fontSize: 11, color: colors.textFaint }} numberOfLines={1}>
                {formatDifficulty(miner.bestDiff)}
              </Text>
              <Text variant="mono" style={{ fontSize: 11, color: tempColor }} numberOfLines={1}>
                {formatTemperature(miner.temp)}
              </Text>
            </>
          ) : (
            <Text variant="mono" style={{ fontSize: 11, color: colors.textFaint }} numberOfLines={1}>
              {isLoading ? t('miners.connecting') : t('common.offline')}
            </Text>
          )}
        </View>

        {/* Warnings — small colored mono labels (no pills) */}
        {warnings && warnings.length > 0 && (
          <View className="flex-row items-center flex-wrap" style={{ gap: 8, marginTop: 3 }}>
            {warnings.slice(0, 2).map((w, i) => (
              <Text
                key={i}
                variant="mono"
                className="uppercase"
                style={{
                  fontSize: 9,
                  letterSpacing: 0.5,
                  color: w.severity === 'danger' ? colors.danger : colors.warning,
                }}
                numberOfLines={1}
              >
                {t(getWarningKey(w.type))}
              </Text>
            ))}
            {warnings.length > 2 && (
              <Text
                variant="mono"
                style={{ fontSize: 9, color: colors.textFaint }}
                numberOfLines={1}
              >
                +{warnings.length - 2}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Hashrate + chevron */}
      <View className="flex-row items-center" style={{ gap: 6 }}>
        {miner.isOnline && (
          <Text variant="mono" style={{ fontSize: 13, color: colors.textValue }}>
            {formatHashrate(miner.hashRate * 1e9)}
          </Text>
        )}
        {onPress && (
          <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
        )}
      </View>
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
          className="border-b border-border-light"
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
