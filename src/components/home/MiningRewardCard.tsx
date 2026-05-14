/**
 * MiningRewardCard - Displays Parasite Pool dispenser slots (mining-reward
 * Ordinals inscriptions) for the current Bitcoin address.
 *
 * Renders nothing when the address has no eligibility (404), is empty, or
 * hasn't loaded yet — the common case is "no rewards" and a perpetually-empty
 * skeleton would just be noise on Home.
 *
 * Claiming itself requires BIP322 message signing via a browser-based Bitcoin
 * wallet, so eligible slots link out to parasite.space rather than attempting
 * a native claim flow.
 */

import { useCallback, useMemo, useState } from 'react';
import { View, Image, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Card } from '../Card';
import { Text } from '../Text';
import { getDispenserEligibility } from '@/api/dispenser';
import { buildSlots, type DispenserSlot, type Eligibility } from '@/types';
import { useSettingsStore } from '@/store/settingsStore';
import { usePolling } from '@/hooks/usePolling';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';

const REFRESH_INTERVAL_MS = 60_000;
const PARASITE_BASE = 'https://parasite.space';

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

  if (!bitcoinAddress || !eligibility) return null;
  if (miningSlots.length === 0 && whitelistSlots.length === 0) return null;

  return (
    <Card padding="sm" className={className}>
      <View className="mb-3 flex-row items-center gap-2">
        <Ionicons name="gift-outline" size={18} color={colors.textMuted} />
        <Text variant="subtitle" className="text-base">
          {t('home.miningReward')}
        </Text>
      </View>

      {miningSlots.length > 0 && (
        <SlotGrid slots={miningSlots} address={bitcoinAddress} />
      )}

      {whitelistSlots.length > 0 && (
        <View className={miningSlots.length > 0 ? 'mt-4' : ''}>
          <Text variant="caption" color="muted" className="mb-2">
            {t('home.miningRewardWhitelist')}
          </Text>
          <SlotGrid slots={whitelistSlots} address={bitcoinAddress} />
        </View>
      )}
    </Card>
  );
}

function SlotGrid({
  slots,
  address,
}: {
  slots: DispenserSlot[];
  address: string;
}) {
  return (
    <View className="flex-row flex-wrap -mx-1">
      {slots.map((slot) => (
        <View key={slot.index} className="w-1/3 px-1 mb-2">
          <SlotTile slot={slot} address={address} />
        </View>
      ))}
    </View>
  );
}

function SlotTile({ slot, address }: { slot: DispenserSlot; address: string }) {
  const { t } = useTranslation();

  const handlePress = () => {
    if (slot.claimed) {
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
      <Image
        source={{ uri: `https://ordinals.com/content/${slot.inscriptionId}` }}
        style={{ width: '100%', aspectRatio: 1, backgroundColor: 'transparent' }}
        resizeMode="contain"
      />

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
          name={slot.claimed ? 'link-outline' : 'open-outline'}
          size={14}
          color={colors.textMuted}
        />
      </View>
    </Pressable>
  );
}
