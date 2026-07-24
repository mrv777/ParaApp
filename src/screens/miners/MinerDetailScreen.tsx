/**
 * MinerDetailScreen - Detailed view of a single local miner
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { View, ScrollView, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import {
  AliasEditSheet,
  AsicHeatmap,
  KBoxAuthSheet,
  MinerStatsSection,
  DeviceInfoSection,
  LinkedWorkerSection,
  MinerControlsSection,
} from '@/components/miners';
import {
  useMinerStore,
  selectMiners,
} from '@/store/minerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { usePolling } from '@/hooks/usePolling';
import { haptics } from '@/utils/haptics';
import { formatTimestamp, formatDifficulty } from '@/utils/formatting';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';
import type { MinersStackScreenProps } from '@/types/navigation';

type Props = MinersStackScreenProps<'MinerDetail'>;

export function MinerDetailScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { ip } = route.params;

  // State
  const [aliasSheetVisible, setAliasSheetVisible] = useState(false);
  const [keySheetVisible, setKeySheetVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Store
  const miners = useMinerStore(selectMiners);
  const refreshMiner = useMinerStore((s) => s.refreshMiner);
  const updateMinerAlias = useMinerStore((s) => s.updateMinerAlias);
  const getWarnings = useMinerStore((s) => s.getWarnings);
  const temperatureUnit = useSettingsStore((s) => s.temperatureUnit);

  // Find the miner
  const miner = useMemo(() => miners.find((m) => m.ip === ip), [miners, ip]);

  // Compute warnings
  const warnings = useMemo(
    () => (miner ? getWarnings(miner, temperatureUnit) : []),
    [miner, getWarnings, temperatureUnit]
  );

  // Navigate back if miner is removed
  useEffect(() => {
    if (!miner) {
      navigation.goBack();
    }
  }, [miner, navigation]);

  // Polling for live updates
  const onPoll = useCallback(() => refreshMiner(ip), [ip, refreshMiner]);

  usePolling({
    onPoll,
    enabled: !!miner && miner.isOnline,
    immediate: true,
  });

  // Handlers
  const handleBack = useCallback(() => {
    haptics.light();
    navigation.goBack();
  }, [navigation]);

  const handleEditAlias = useCallback(() => {
    haptics.light();
    setAliasSheetVisible(true);
  }, []);

  const handleOpenSettings = useCallback(() => {
    haptics.light();
    navigation.navigate('MinerSettings', { ip });
  }, [navigation, ip]);

  const handleSaveAlias = useCallback(
    (alias: string) => {
      updateMinerAlias(ip, alias);
      setAliasSheetVisible(false);
    },
    [ip, updateMinerAlias]
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshMiner(ip);
    setRefreshing(false);
    haptics.light();
  }, [ip, refreshMiner]);

  // Don't render if miner not found (will navigate back via useEffect)
  if (!miner) {
    return null;
  }

  const displayName = miner.alias || miner.hostname || miner.ip;
  // KBox reachable but API key missing/rejected/disabled — the sheet is
  // only ever opened by a user tap, so polling flipping this flag can
  // never spam sheets.
  const kboxLocked = miner.isOnline && !!miner.kboxAuthError;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-border">
        <Pressable
          onPress={handleBack}
          className="p-2 -ml-2 mr-2"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <View className="flex-1">
          <View className="flex-row items-baseline gap-2">
            <Text
              variant="subtitle"
              style={{ fontSize: 16, color: colors.textHigh }}
              numberOfLines={1}
            >
              {displayName}
            </Text>
            {miner.deviceModel && miner.deviceModel !== 'Unknown' && (
              <Text
                variant="mono"
                style={{ fontSize: 11, color: colors.textFaint }}
                numberOfLines={1}
              >
                {miner.deviceModel}
              </Text>
            )}
          </View>
          {!miner.isOnline && (
            <Text variant="mono" style={{ fontSize: 11, color: colors.danger }}>
              {t('common.offline')}
            </Text>
          )}
          {miner.isOnline && miner.isStandby && (
            <Text variant="mono" style={{ fontSize: 11, color: colors.warning }}>
              {t('miners.standby')}
            </Text>
          )}
        </View>
        {miner.isOnline && !kboxLocked && (
          <Pressable
            onPress={handleOpenSettings}
            className="p-2 mr-1"
            hitSlop={8}
          >
            <Ionicons name="settings-outline" size={20} color={colors.textMuted} />
          </Pressable>
        )}
        <Pressable
          onPress={handleEditAlias}
          className="p-2 -mr-2"
          hitSlop={8}
        >
          <Ionicons name="pencil" size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.text}
          />
        }
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 32, gap: 16 }}
      >
        {/* Warnings — colored mono lines (no pills) */}
        {warnings.length > 0 && (
          <View
            className="border border-border"
            style={{ paddingHorizontal: 14, paddingVertical: 12, gap: 8 }}
          >
            {warnings.map((warning) => {
              const warnColor =
                warning.severity === 'danger' ? colors.danger : colors.warning;
              return (
                <View key={warning.type} className="flex-row items-center" style={{ gap: 8 }}>
                  <Ionicons name="alert-circle" size={16} color={warnColor} />
                  <Text
                    variant="mono"
                    style={{ fontSize: 12, color: warnColor, flex: 1 }}
                  >
                    {warning.message}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* KBox locked state: reachable, but no working API key */}
        {kboxLocked && (
          <Card padding="none">
            <View
              className="items-center"
              style={{ paddingHorizontal: 20, paddingVertical: 24, gap: 10 }}
            >
              <Ionicons name="lock-closed" size={28} color={colors.warning} />
              <Text
                variant="mono"
                className="font-bold"
                style={{ fontSize: 14, color: colors.textHigh }}
              >
                {miner.kboxAuthError === 'api_disabled'
                  ? t('miners.kboxApiDisabledTitle')
                  : t('miners.kboxKeyRequired')}
              </Text>
              <Text
                variant="caption"
                color="muted"
                style={{ textAlign: 'center' }}
              >
                {miner.kboxAuthError === 'api_disabled'
                  ? t('miners.kboxApiDisabled')
                  : t('miners.kboxApiKeyHint')}
              </Text>
              <Pressable
                onPress={() => {
                  haptics.light();
                  setKeySheetVisible(true);
                }}
                className="mt-2 px-5 py-3 bg-foreground items-center"
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <Text variant="body" className="font-medium text-gray-950">
                  {t('miners.kboxEnterKey')}
                </Text>
              </Pressable>
            </View>
          </Card>
        )}

        {/* Online state: show stats */}
        {kboxLocked ? null : miner.isOnline ? (
          <MinerStatsSection miner={miner} temperatureUnit={temperatureUnit} />
        ) : (
          /* Offline state */
          <Card padding="none">
            <View
              className="flex-row items-center border-b border-border-light"
              style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}
            >
              <View className="w-2 h-2 rounded-full bg-danger" />
              <Text variant="mono" className="font-bold" style={{ fontSize: 14, color: colors.textHigh }}>
                {t('miners.minerIsOffline')}
              </Text>
            </View>
            <View
              className="flex-row items-center justify-between"
              style={{ paddingHorizontal: 16, paddingVertical: 11 }}
            >
              <Text variant="mono" style={{ fontSize: 12, color: colors.textMuted }}>
                {t('miners.lastSeen')}
              </Text>
              <Text variant="mono" style={{ fontSize: 12, color: colors.textValue }}>
                {miner.lastSeen ? formatTimestamp(miner.lastSeen) : t('common.never')}
              </Text>
            </View>
            {miner.bestDiff > 0 && (
              <View
                className="flex-row items-center justify-between border-t border-border-light"
                style={{ paddingHorizontal: 16, paddingVertical: 11 }}
              >
                <Text variant="mono" style={{ fontSize: 12, color: colors.textMuted }}>
                  {t('miners.lastBestDiff')}
                </Text>
                <Text variant="mono" style={{ fontSize: 12, color: colors.textValue }}>
                  {formatDifficulty(miner.bestDiff)}
                </Text>
              </View>
            )}
          </Card>
        )}

        {/* Per-ASIC heatmap. Avalon self-fetches estats while expanded;
            Hammer v3 already has per-chip temps in its regular poll. */}
        {miner.isOnline && miner.minerType === 'avalon' && (
          <AsicHeatmap ip={miner.ip} />
        )}
        {miner.isOnline &&
          miner.minerType === 'hammer' &&
          miner.asicTemps &&
          miner.asicTemps.length > 0 && (
            <AsicHeatmap
              ip={miner.ip}
              temps={miner.asicTemps}
              profile="bm13xx"
              cols={miner.asicTemps.length <= 4 ? miner.asicTemps.length : 8}
            />
          )}

        {/* Device info */}
        <DeviceInfoSection miner={miner} />

        {/* Controls (only when online; hidden while a KBox is locked —
            every control needs the API key) */}
        {!kboxLocked && <MinerControlsSection miner={miner} />}

        {/* Linked worker (conditional) */}
        <LinkedWorkerSection
          stratumUser={miner.stratumUser}
          currentMinerIp={miner.ip}
        />
      </ScrollView>

      {/* KBox API key entry (verifies + persists, then refetches stats) */}
      {miner.minerType === 'kbox' && (
        <KBoxAuthSheet
          visible={keySheetVisible}
          ip={miner.ip}
          onSuccess={() => void refreshMiner(ip)}
          onClose={() => setKeySheetVisible(false)}
        />
      )}

      {/* Alias edit sheet */}
      <AliasEditSheet
        visible={aliasSheetVisible}
        currentAlias={miner.alias || ''}
        hostname={miner.hostname}
        onSave={handleSaveAlias}
        onClose={() => setAliasSheetVisible(false)}
      />
    </SafeAreaView>
  );
}
