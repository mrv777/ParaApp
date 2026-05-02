/**
 * AsicHeatmap - Per-ASIC temperature grid for Avalon miners.
 *
 * Renders one colored cell per ASIC (160 cells on the Q's single
 * hashboard) so the user can spot a hot or dead chip at a glance.
 * Collapsed by default — expand prompts the parent to start fetching
 * `estats` (heavier than `stats`) via the `onExpand` callback.
 *
 * Color thresholds are tuned for Avalon's BM-class ASICs which run
 * notably hotter than the BM13xx chips in AxeOS — the AxeOS-wide
 * tempThresholds (68°C caution) would mark every cell red here.
 */

import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../Text';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';
import { haptics } from '@/utils/haptics';
import { avalon } from '@/api';
import { isSuccess } from '@/api/client';

/** Poll cadence while the heatmap is expanded. Long enough to keep
 * the device's single-threaded cgminer happy alongside the regular
 * stats poll on the detail screen. */
const HEATMAP_POLL_MS = 10000;

export interface AsicHeatmapProps {
  /** Miner IP — used to fetch estats when the section is expanded */
  ip: string;
  /** Fixed grid width — ASICs per row. Defaults to 16 (160/16=10 rows on Q) */
  cols?: number;
}

/**
 * Avalon-tuned temperature buckets. Tweak as we see real-world data
 * from other Canaan models — the Q's normal range is ~70–90°C under
 * load with a target of 80°C.
 */
function tempColor(t: number): string {
  if (t === 0) return colors.surfaceElevated;
  if (t < 70) return '#3b82f6'; // cool — blue
  if (t < 80) return '#22c55e'; // normal — green
  if (t < 90) return '#eab308'; // warm — yellow
  if (t < 95) return '#f97316'; // hot — orange
  return colors.danger; // critical — red
}

export function AsicHeatmap({ ip, cols = 16 }: AsicHeatmapProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [temps, setTemps] = useState<number[] | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTemps = useCallback(async () => {
    setLoading(true);
    const result = await avalon.getEStats(ip);
    if (isSuccess(result)) {
      setTemps(result.data.hb?.PVT_T0);
    }
    setLoading(false);
  }, [ip]);

  // Start/stop polling when expansion changes
  useEffect(() => {
    if (!expanded) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }
    void fetchTemps();
    pollTimerRef.current = setInterval(fetchTemps, HEATMAP_POLL_MS);
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [expanded, fetchTemps]);

  const stats = useMemo(() => {
    if (!temps || temps.length === 0) {
      return null;
    }
    const valid = temps.filter((v) => v > 0);
    if (valid.length === 0) return null;
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
    return { min, max, avg, count: temps.length };
  }, [temps]);

  const handleToggle = useCallback(() => {
    haptics.light();
    setExpanded((prev) => !prev);
  }, []);

  return (
    <View className="px-4 mb-4">
      <Pressable
        onPress={handleToggle}
        className="flex-row items-center justify-between bg-secondary rounded-lg p-3"
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        <View className="flex-row items-center gap-2">
          <Ionicons name="grid-outline" size={18} color={colors.text} />
          <Text variant="body" className="font-medium">
            {t('miners.asicHeatmap')}
          </Text>
          {stats && (
            <Text variant="caption" color="muted">
              {`${stats.count} · ${Math.round(stats.min)}–${Math.round(stats.max)}°C`}
            </Text>
          )}
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textMuted}
        />
      </Pressable>

      {expanded && (
        <View className="mt-3 bg-secondary rounded-lg p-3">
          {!temps || temps.length === 0 ? (
            <Text variant="caption" color="muted" className="text-center py-4">
              {loading
                ? t('miners.asicHeatmapLoading')
                : t('miners.asicHeatmapEmpty')}
            </Text>
          ) : (
            <>
              <View className="flex-row flex-wrap gap-[2px]">
                {temps.map((temp, i) => (
                  <View
                    key={i}
                    style={{
                      width: `${100 / cols}%`,
                      aspectRatio: 1,
                      padding: 1,
                    }}
                  >
                    <View
                      style={{
                        flex: 1,
                        backgroundColor: tempColor(temp),
                        borderRadius: 2,
                      }}
                    />
                  </View>
                ))}
              </View>
              {stats && (
                <View className="flex-row justify-between mt-3">
                  <Text variant="caption" color="muted">
                    {`min ${Math.round(stats.min)}°C`}
                  </Text>
                  <Text variant="caption" color="muted">
                    {`avg ${Math.round(stats.avg)}°C`}
                  </Text>
                  <Text variant="caption" color="muted">
                    {`max ${Math.round(stats.max)}°C`}
                  </Text>
                </View>
              )}
              <View className="flex-row justify-center gap-3 mt-2">
                {[
                  { color: '#3b82f6', label: '<70' },
                  { color: '#22c55e', label: '70-80' },
                  { color: '#eab308', label: '80-90' },
                  { color: '#f97316', label: '90-95' },
                  { color: colors.danger, label: '>95' },
                ].map((band) => (
                  <View key={band.label} className="flex-row items-center gap-1">
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 2,
                        backgroundColor: band.color,
                      }}
                    />
                    <Text variant="caption" color="muted">
                      {band.label}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );
}
