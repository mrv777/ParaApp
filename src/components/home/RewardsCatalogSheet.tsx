/**
 * RewardsCatalogSheet - Bottom sheet mirroring the website's "Available
 * Rewards" modal: every dispenser asset still in stock and the minimum share
 * difficulty required to earn it, plus the user's progress toward the next
 * tier (based on their best difficulty).
 *
 * Data is fetched on each open (like the site modal) — the catalog changes
 * rarely, so no store slice or polling is warranted.
 */

import { useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Sheet } from '../Sheet';
import { Text } from '../Text';
import { getDispenserAssets, getDispenserTiers } from '@/api/dispenser';
import { buildRewardCatalog, type RewardCatalogEntry } from '@/types';
import { useUserStore, selectUserStats } from '@/store/userStore';
import { formatDifficulty } from '@/utils/formatting';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';

export interface RewardsCatalogSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function RewardsCatalogSheet({ visible, onClose }: RewardsCatalogSheetProps) {
  const { t } = useTranslation();
  const bestDifficulty = useUserStore(selectUserStats)?.bestDifficulty ?? 0;

  const [rewards, setRewards] = useState<RewardCatalogEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setRewards(null);
    setFailed(false);
    (async () => {
      const [assetsResult, tiersResult] = await Promise.all([
        getDispenserAssets(),
        getDispenserTiers(),
      ]);
      if (cancelled) return;
      if (assetsResult.success && tiersResult.success) {
        setRewards(buildRewardCatalog(assetsResult.data, tiersResult.data));
      } else {
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  // First reward the user hasn't reached yet — highlighted as the next target.
  const nextIndex = rewards ? rewards.findIndex((r) => r.threshold > bestDifficulty) : -1;

  return (
    <Sheet visible={visible} onClose={onClose} scrollable>
      <View className="flex-row items-center justify-between pb-2">
        <Text variant="subtitle" className="font-semibold">
          {t('home.rewardsCatalogTitle')}
        </Text>
        <Pressable onPress={onClose} className="p-2 -mr-2" hitSlop={8}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
      </View>

      <Text variant="caption" color="muted" className="pb-4">
        {t('home.rewardsCatalogIntro')}
      </Text>

      {failed ? (
        <Text variant="caption" color="danger" className="py-4 text-center">
          {t('common.error')}
        </Text>
      ) : rewards === null ? (
        <Text variant="caption" color="muted" className="py-4 text-center">
          {t('common.loading')}
        </Text>
      ) : rewards.length === 0 ? (
        <Text variant="caption" color="muted" className="py-4 text-center">
          {t('home.rewardsCatalogEmpty')}
        </Text>
      ) : (
        <View className="border border-border">
          {rewards.map((reward, index) => (
            <RewardRow
              key={reward.name}
              reward={reward}
              isFirst={index === 0}
              reached={bestDifficulty > 0 && reward.threshold <= bestDifficulty}
              isNext={index === nextIndex && bestDifficulty > 0}
              bestDifficulty={bestDifficulty}
            />
          ))}
        </View>
      )}
    </Sheet>
  );
}

function RewardRow({
  reward,
  isFirst,
  reached,
  isNext,
  bestDifficulty,
}: {
  reward: RewardCatalogEntry;
  isFirst: boolean;
  reached: boolean;
  isNext: boolean;
  bestDifficulty: number;
}) {
  const { t } = useTranslation();
  const progress = isNext ? Math.min(1, bestDifficulty / reward.threshold) : 0;

  return (
    <View
      className={isFirst ? '' : 'border-t border-border-light'}
      style={{ paddingHorizontal: 14, paddingVertical: 12 }}
    >
      <View className="flex-row items-center justify-between" style={{ gap: 12 }}>
        <View className="flex-row items-center" style={{ flex: 1, gap: 8 }}>
          {reached && <Ionicons name="checkmark" size={14} color={colors.success} />}
          <Text
            variant="mono"
            style={{
              fontSize: 13,
              color: reached ? colors.textDim : colors.textValue,
              flexShrink: 1,
            }}
            numberOfLines={2}
          >
            {reward.description || reward.name}
          </Text>
        </View>
        <Text
          variant="mono"
          style={{
            fontSize: 11,
            color: reached ? colors.textDim : colors.textFaint,
            flexShrink: 0,
          }}
        >
          {t('home.rewardsLeft', { remaining: reward.remaining, total: reward.total })}
        </Text>
        <Text
          variant="mono"
          className="font-bold"
          style={{ fontSize: 13, color: reached ? colors.textDim : colors.text }}
        >
          {formatDifficulty(reward.threshold)}
        </Text>
      </View>

      {isNext && (
        <View style={{ marginTop: 8 }}>
          <View style={{ height: 3, backgroundColor: colors.borderLight }}>
            <View
              style={{
                height: 3,
                width: `${progress * 100}%`,
                backgroundColor: colors.primary,
              }}
            />
          </View>
          <Text variant="mono" style={{ fontSize: 10, color: colors.textFaint, marginTop: 4 }}>
            {t('home.rewardsNextTarget')} · {t('home.rewardsYourBest', { diff: formatDifficulty(bestDifficulty) })}
          </Text>
        </View>
      )}
    </View>
  );
}
