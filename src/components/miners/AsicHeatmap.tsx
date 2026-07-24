/**
 * AsicHeatmap - Per-ASIC temperature grid.
 *
 * Renders one colored cell per ASIC (160 cells on the Avalon Q's single
 * hashboard; 4 chips on a Hammer) so the user can spot a hot or dead chip
 * at a glance. Collapsed by default.
 *
 * Two data sources:
 *  - Avalon: self-fetches `estats` (heavier than `stats`) while expanded.
 *  - Static (`temps` prop): the parent already has per-chip temps from its
 *    regular poll (e.g. Hammer v3's `chips[]`) — no extra fetch/poll here.
 *
 * Color buckets are tuned per `profile`: Avalon's BM-class ASICs run notably
 * hotter than the BM13xx chips in AxeOS/Hammer, so each gets its own bands.
 */

import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../Text';
import { Card } from '../Card';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';
import { haptics } from '@/utils/haptics';
import { avalon } from '@/api';
import { isSuccess } from '@/api/client';

/** Poll cadence while the heatmap is expanded. Long enough to keep
 * the device's single-threaded cgminer happy alongside the regular
 * stats poll on the detail screen. */
const HEATMAP_POLL_MS = 10000;

/** Color tuning per ASIC family. */
type HeatmapProfile = 'avalon' | 'bm13xx';

export interface AsicHeatmapProps {
  /** Miner IP — used to fetch estats when the section is expanded (Avalon) */
  ip: string;
  /** Fixed grid width — ASICs per row. Defaults to 16 (160/16=10 rows on Q) */
  cols?: number;
  /**
   * Pre-supplied per-chip temps. When provided, render these directly and
   * skip the Avalon estats self-fetch — used by miners whose regular poll
   * already carries chip temps (Hammer v3).
   */
  temps?: number[];
  /** Color-band tuning. Defaults to 'avalon'. */
  profile?: HeatmapProfile;
}

/** Temperature band definitions per profile: [ceiling, color, label]. */
const TEMP_BANDS: Record<
  HeatmapProfile,
  { max: number; color: string; label: string }[]
> = {
  // Avalon Q normal range ~70–90°C under load, target 80°C.
  avalon: [
    { max: 70, color: '#3b82f6', label: '<70' },
    { max: 80, color: '#22c55e', label: '70-80' },
    { max: 90, color: '#eab308', label: '80-90' },
    { max: 95, color: '#f97316', label: '90-95' },
    { max: Infinity, color: colors.danger, label: '>95' },
  ],
  // BM13xx chip-die temps (AxeOS/Hammer) run much cooler — ~55–60°C typical.
  bm13xx: [
    { max: 50, color: '#3b82f6', label: '<50' },
    { max: 60, color: '#22c55e', label: '50-60' },
    { max: 70, color: '#eab308', label: '60-70' },
    { max: 80, color: '#f97316', label: '70-80' },
    { max: Infinity, color: colors.danger, label: '>80' },
  ],
};

function tempColor(t: number, profile: HeatmapProfile): string {
  if (t === 0) return colors.surfaceElevated;
  const band = TEMP_BANDS[profile].find((b) => t < b.max);
  return band ? band.color : colors.danger;
}

export function AsicHeatmap({
  ip,
  cols = 16,
  temps: providedTemps,
  profile = 'avalon',
}: AsicHeatmapProps) {
  const { t } = useTranslation();
  const isStatic = providedTemps !== undefined;
  const [expanded, setExpanded] = useState(false);
  const [fetchedTemps, setFetchedTemps] = useState<number[] | undefined>(
    undefined
  );
  const [loading, setLoading] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Static mode renders the parent-supplied temps; otherwise use fetched.
  const temps = isStatic ? providedTemps : fetchedTemps;

  const fetchTemps = useCallback(async () => {
    setLoading(true);
    const result = await avalon.getEStats(ip);
    if (isSuccess(result)) {
      setFetchedTemps(result.data.hb?.PVT_T0);
    }
    setLoading(false);
  }, [ip]);

  // Start/stop polling when expansion changes (Avalon self-fetch mode only)
  useEffect(() => {
    if (isStatic) return;
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
  }, [isStatic, expanded, fetchTemps]);

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
    <Card padding="none">
      <Pressable
        onPress={handleToggle}
        className="flex-row items-center justify-between px-4 py-5 active:opacity-70"
      >
        <View className="flex-row items-center gap-2">
          <Ionicons name="grid-outline" size={16} color={colors.textMuted} />
          <Text variant="subtitle" style={{ fontSize: 15, color: colors.textHigh }}>
            {t('miners.asicHeatmap')}
          </Text>
          {stats && (
            <Text variant="mono" style={{ fontSize: 11, color: colors.textDim }}>
              {`${stats.count} · ${Math.round(stats.min)}–${Math.round(stats.max)}°C`}
            </Text>
          )}
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textDim}
        />
      </Pressable>

      {expanded && (
        <View className="border-t border-border-light" style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
          {!temps || temps.length === 0 ? (
            <Text variant="mono" style={{ fontSize: 12, color: colors.textMuted, textAlign: 'center', paddingVertical: 16 }}>
              {loading
                ? t('miners.asicHeatmapLoading')
                : t('miners.asicHeatmapEmpty')}
            </Text>
          ) : (
            <>
              <View className="flex-row flex-wrap">
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
                        backgroundColor: tempColor(temp, profile),
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
                {TEMP_BANDS[profile].map((band) => (
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
    </Card>
  );
}
