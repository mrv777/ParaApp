/**
 * MiningRewardCard - Displays Parasite Pool dispenser slots (mining-reward
 * Ordinals inscriptions) for the current Bitcoin address.
 *
 * Always renders (when an address is set) so the "View rewards" catalog is
 * reachable by everyone — especially miners who haven't earned anything yet.
 * The slot grid only appears when the address has eligibility; otherwise a
 * one-line hint explains how rewards are earned.
 *
 * Claiming itself requires BIP322 message signing via a browser-based Bitcoin
 * wallet, so eligible slots link out to parasite.space rather than attempting
 * a native claim flow.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Image, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Card } from '../Card';
import { Text } from '../Text';
import { RewardsCatalogSheet } from './RewardsCatalogSheet';
import { getDispenserEligibility, getDispenserTiers } from '@/api/dispenser';
import { buildSlots, type DispenserSlot, type Eligibility, type TierInfo } from '@/types';
import { formatDifficulty } from '@/utils/formatting';
import { useSettingsStore } from '@/store/settingsStore';
import { usePolling } from '@/hooks/usePolling';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';

const REFRESH_INTERVAL_MS = 60_000;
const PARASITE_BASE = 'https://parasite.space';
/** Fixed artwork the website shows for code-redemption (non-inscription) slots. */
const CODE_ASSET_IMAGE = `${PARASITE_BASE}/dispenser/homeminers.webp`;

// Tag the fetched data with the address that produced it so a late-returning
// response for a stale address can never overwrite the active one.
interface TaggedEligibility {
  address: string;
  data: Eligibility | null;
}

export interface MiningRewardCardProps {
  className?: string;
}

export function MiningRewardCard({ className = '' }: MiningRewardCardProps) {
  const { t } = useTranslation();
  const bitcoinAddress = useSettingsStore((s) => s.bitcoinAddress);
  const [tagged, setTagged] = useState<TaggedEligibility | null>(null);
  const [tiers, setTiers] = useState<TierInfo[] | null>(null);
  const [catalogVisible, setCatalogVisible] = useState(false);

  // Tier thresholds change rarely — fetch once per mount for the slot captions.
  useEffect(() => {
    let cancelled = false;
    getDispenserTiers().then((result) => {
      if (!cancelled && result.success) setTiers(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onPoll = useCallback(async () => {
    if (!bitcoinAddress) return;
    const addr = bitcoinAddress;
    const result = await getDispenserEligibility(addr);
    if (result.success) {
      setTagged({ address: addr, data: result.data });
    }
  }, [bitcoinAddress]);

  // usePolling handles background pause, overlap guarding, and re-polls on
  // foreground resume — important so the card refreshes after the user returns
  // from claiming on the website.
  usePolling({
    onPoll,
    enabled: !!bitcoinAddress,
    interval: REFRESH_INTERVAL_MS,
  });

  // Only trust the data when it matches the currently-configured address.
  const eligibility =
    tagged && tagged.address === bitcoinAddress ? tagged.data : null;

  const { miningSlots, whitelistSlots } = useMemo(() => {
    if (!eligibility) return { miningSlots: [], whitelistSlots: [] };
    const all = buildSlots(eligibility);
    return {
      miningSlots: all.filter((s) => s.tier !== 'override'),
      whitelistSlots: all.filter((s) => s.tier === 'override'),
    };
  }, [eligibility]);

  // Lowest threshold per tier name, for the per-slot target caption.
  const tierThresholds = useMemo(() => {
    const map: Record<string, number> = {};
    for (const tier of tiers ?? []) {
      if (map[tier.name] == null || tier.threshold < map[tier.name]) {
        map[tier.name] = tier.threshold;
      }
    }
    return map;
  }, [tiers]);

  if (!bitcoinAddress) return null;

  const hasSlots = miningSlots.length > 0 || whitelistSlots.length > 0;

  return (
    <Card padding="sm" className={className}>
      <View className="mb-3 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Ionicons name="gift-outline" size={18} color={colors.textMuted} />
          <Text variant="subtitle" className="text-base">
            {t('home.miningReward')}
          </Text>
        </View>
        <Pressable
          onPress={() => setCatalogVisible(true)}
          hitSlop={6}
          className="active:opacity-60"
        >
          <Text
            variant="mono"
            style={{
              fontSize: 11,
              color: colors.textSecondary,
              borderBottomWidth: 1,
              borderBottomColor: colors.textDim,
              paddingBottom: 1,
            }}
          >
            {t('home.rewardsView')}
          </Text>
        </Pressable>
      </View>

      {!hasSlots && (
        <Text variant="caption" color="muted">
          {t('home.miningRewardHint')}
        </Text>
      )}

      {miningSlots.length > 0 && (
        <SlotGrid
          slots={miningSlots}
          address={bitcoinAddress}
          tierThresholds={tierThresholds}
        />
      )}

      {whitelistSlots.length > 0 && (
        <View className={miningSlots.length > 0 ? 'mt-4' : ''}>
          <Text variant="caption" color="muted" className="mb-2">
            {t('home.miningRewardWhitelist')}
          </Text>
          <SlotGrid
            slots={whitelistSlots}
            address={bitcoinAddress}
            tierThresholds={tierThresholds}
          />
        </View>
      )}

      <RewardsCatalogSheet
        visible={catalogVisible}
        onClose={() => setCatalogVisible(false)}
      />
    </Card>
  );
}

function SlotGrid({
  slots,
  address,
  tierThresholds,
}: {
  slots: DispenserSlot[];
  address: string;
  tierThresholds: Record<string, number>;
}) {
  return (
    <View className="flex-row flex-wrap -mx-1">
      {slots.map((slot) => (
        <View key={slot.index} className="w-1/3 px-1 mb-2">
          <SlotTile
            slot={slot}
            address={address}
            threshold={tierThresholds[slot.tier]}
          />
        </View>
      ))}
    </View>
  );
}

function SlotTile({
  slot,
  address,
  threshold,
}: {
  slot: DispenserSlot;
  address: string;
  threshold?: number;
}) {
  const { t } = useTranslation();
  // Code-redemption slots have no inscription: the site shows fixed artwork
  // and redemption happens on the user page (no share page to link to).
  const isCode = !slot.inscriptionId;
  const [imageFailed, setImageFailed] = useState(false);

  const handlePress = () => {
    if (slot.claimed && !isCode) {
      Linking.openURL(`${PARASITE_BASE}/dispenser/share/${slot.inscriptionId}`);
    } else {
      Linking.openURL(`${PARASITE_BASE}/user/${address}`);
    }
  };

  // The whole tile is a single Pressable: the footer carries the status label
  // and an action icon (link / open-in-browser). The text button was dropped
  // because translated labels overflow the ~90pt tile inner width on phones.
  const accessibilityLabel = slot.claimed
    ? `${t('home.miningRewardClaimed')}. ${t('home.miningRewardLink')}`
    : `${t('home.miningRewardEligible')}. ${t('home.miningRewardClaimOnWeb')}`;

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
      className="bg-background border border-border rounded-md p-2"
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      {isCode && imageFailed ? (
        <View
          style={{ width: '100%', aspectRatio: 1 }}
          className="items-center justify-center"
        >
          <Ionicons name="pricetag-outline" size={28} color={colors.textMuted} />
        </View>
      ) : (
        <Image
          source={{
            uri: isCode
              ? CODE_ASSET_IMAGE
              : `https://ordinals.com/content/${slot.inscriptionId}`,
          }}
          style={{ width: '100%', aspectRatio: 1, backgroundColor: 'transparent' }}
          resizeMode="contain"
          onError={isCode ? () => setImageFailed(true) : undefined}
        />
      )}

      {isCode && (
        <Text
          variant="mono"
          style={{ fontSize: 9, color: colors.textDim, marginTop: 4 }}
          numberOfLines={1}
        >
          {t('home.miningRewardCode')}
        </Text>
      )}

      {threshold != null && (
        <Text
          variant="mono"
          style={{ fontSize: 9, color: colors.textFaint, marginTop: isCode ? 2 : 4 }}
          numberOfLines={1}
        >
          {t('home.miningRewardTierTarget', { diff: formatDifficulty(threshold) })}
        </Text>
      )}

      <View className="mt-2 flex-row items-center justify-between">
        <Text
          variant="caption"
          color={slot.claimed ? 'success' : 'default'}
          className="text-xs font-semibold"
        >
          {slot.claimed
            ? t('home.miningRewardClaimed')
            : t('home.miningRewardEligible')}
        </Text>
        <Ionicons
          name={slot.claimed && !isCode ? 'link-outline' : 'open-outline'}
          size={14}
          color={colors.textMuted}
        />
      </View>
    </Pressable>
  );
}
