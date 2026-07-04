/**
 * MinerCard — grid card for the Miners "card" (2-column) view.
 *
 * Leads with the miner's hashrate hero and a 2×2 vitals grid
 * (temp · power · best diff · fan). A square hairline box matching the
 * brand's terminal/brutalist language (no radius, no shadow). Swipe-left
 * reveals Remove; tapping the card navigates to the miner detail screen.
 *
 * The card width is fixed by the screen (`width` prop) so a lone odd card
 * keeps its half-column footprint instead of stretching full-width.
 */

import { View, Pressable } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../Text';
import {
  formatHashrate,
  formatTemperature,
  formatPower,
  formatDifficulty,
  formatPercent,
} from '@/utils/formatting';
import { haptics } from '@/utils/haptics';
import { colors } from '@/constants/colors';
import { getTempThresholdsFor } from '@/constants/theme';
import { useSettingsStore } from '@/store/settingsStore';
import { useTranslation } from '@/i18n';
import type { LocalMiner, MinerWarning } from '@/types';

/** Placeholder shown for any reading that isn't available (e.g. offline). */
const DASH = '—';

/**
 * Keep a "value unit" reading (e.g. "861.0 W") on a single line by binding it
 * with a non-breaking space — otherwise the trailing unit can wrap or the line
 * clips its last glyph in a width-constrained cell.
 */
const noBreak = (s: string) => s.replace(/ /g, ' ');

export interface MinerCardProps {
  miner: LocalMiner;
  /** Accepted for call-site parity with MinerRow; the grid card stays minimal. */
  warnings?: MinerWarning[];
  onPress?: () => void;
  onDelete: () => void;
  isLoading?: boolean;
  /** Fixed column width supplied by the 2-up grid in MinersScreen. */
  width?: number;
}

export function MinerCard({
  miner,
  onPress,
  onDelete,
  isLoading = false,
  width,
}: MinerCardProps) {
  const { t } = useTranslation();
  const temperatureUnit = useSettingsStore((s) => s.temperatureUnit);

  const online = miner.isOnline;
  const standby = miner.isStandby === true;
  const displayName = miner.alias || miner.hostname || miner.ip;
  const nameColor = online ? colors.textHigh : colors.dangerTint;
  const hasModel = miner.deviceModel && miner.deviceModel !== 'Unknown';

  // Temperature color uses the shared per-type ramp: small ASICs alert near
  // 70°C, while Avalon (which runs hot by design) only flags genuine overheat.
  const tempColor = (() => {
    if (!online) return colors.textValue;
    const th = getTempThresholdsFor(miner.minerType);
    if (miner.temp >= th.danger) return colors.danger;
    if (miner.temp >= th.caution) return colors.warning;
    return colors.textValue;
  })();

  // Split the formatted hashrate into value + unit for the baseline-aligned hero.
  const [hrValue, ...hrUnitParts] = formatHashrate(miner.hashRate * 1e9).split(' ');
  const hrUnit = hrUnitParts.join(' ');

  // 2×2 vitals — always-defined fields across every miner type.
  const cells: { label: string; value: string; color: string }[] = [
    {
      label: t('miners.temp'),
      value: online ? formatTemperature(miner.temp, temperatureUnit) : DASH,
      color: tempColor,
    },
    {
      label: t('miners.power'),
      value: online ? noBreak(formatPower(miner.power)) : DASH,
      color: colors.textValue,
    },
    {
      label: t('miners.bestDiff'),
      value: online ? formatDifficulty(miner.bestDiff) : DASH,
      color: colors.textValue,
    },
    {
      label: t('miners.fan'),
      value: online ? formatPercent(miner.fanSpeed) : DASH,
      color: colors.textValue,
    },
  ];

  const handlePress = () => {
    if (!onPress) return;
    haptics.light();
    onPress();
  };

  const handleDelete = () => {
    haptics.warning();
    onDelete();
  };

  const renderRightActions = () => (
    <Pressable
      onPress={handleDelete}
      className="bg-danger justify-center items-center px-5"
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
    >
      <Ionicons name="trash-outline" size={20} color="#fff" />
      <Text className="text-white text-xs mt-1">{t('common.delete')}</Text>
    </Pressable>
  );

  const content = (
    <View
      className="border border-border"
      style={{
        backgroundColor: colors.card,
        paddingHorizontal: 13,
        paddingTop: 12,
        paddingBottom: 12,
      }}
    >
      {/* Name row: status dot + truncated name */}
      <View className="flex-row items-center" style={{ gap: 8 }}>
        <View
          style={{
            width: 7,
            height: 7,
            borderRadius: 3.5,
            backgroundColor: !online
              ? colors.danger
              : standby
                ? colors.warning
                : colors.success,
          }}
        />
        <Text
          variant="body"
          className="font-semibold flex-1"
          style={{ fontSize: 14, color: nameColor }}
          numberOfLines={1}
        >
          {displayName}
        </Text>
      </View>

      {/* Model line (falls back to IP when the model is unknown) */}
      <Text
        variant="mono"
        style={{ fontSize: 10, color: colors.textFaint, marginTop: 2 }}
        numberOfLines={1}
      >
        {hasModel ? miner.deviceModel : miner.ip}
      </Text>

      {/* Hashrate hero */}
      <View className="flex-row items-baseline" style={{ gap: 5, marginTop: 12 }}>
        <Text
          variant="mono"
          className="font-bold"
          style={{
            fontSize: standby ? 15 : 24,
            lineHeight: 28,
            color: online && !standby ? colors.text : colors.textMuted,
          }}
          numberOfLines={1}
        >
          {!online ? DASH : standby ? t('miners.standby') : hrValue}
        </Text>
        {online && !standby && (
          <Text
            variant="mono"
            style={{ fontSize: 11, color: colors.textMuted }}
            numberOfLines={1}
          >
            {hrUnit}
          </Text>
        )}
      </View>

      {/* 2×2 vitals grid */}
      <View
        style={{
          marginTop: 13,
          paddingTop: 11,
          borderTopWidth: 1,
          borderTopColor: colors.chartGrid,
          rowGap: 7,
        }}
      >
        {[cells.slice(0, 2), cells.slice(2, 4)].map((row, ri) => (
          <View key={ri} className="flex-row" style={{ columnGap: 8 }}>
            {row.map((c) => (
              <View key={c.label} style={{ flex: 1 }}>
                <Text
                  variant="mono"
                  className="uppercase"
                  style={{
                    fontSize: 8,
                    lineHeight: 9,
                    letterSpacing: 0.64,
                    color: colors.textDim,
                  }}
                  numberOfLines={1}
                >
                  {c.label}
                </Text>
                <Text
                  variant="mono"
                  className="font-bold"
                  style={{
                    fontSize: 13,
                    lineHeight: 16,
                    marginTop: 1,
                    paddingRight: 2,
                    color: c.color,
                  }}
                >
                  {c.value}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <Swipeable
      renderRightActions={renderRightActions}
      rightThreshold={40}
      enabled={!isLoading}
      containerStyle={width != null ? { width } : undefined}
    >
      <Pressable
        onPress={handlePress}
        disabled={isLoading || !onPress}
        style={({ pressed }) => ({
          opacity: pressed ? 0.7 : isLoading ? 0.5 : 1,
        })}
      >
        {content}
      </Pressable>
    </Swipeable>
  );
}
