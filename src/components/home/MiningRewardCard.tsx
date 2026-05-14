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

import { useEffect, useMemo, useState } from 'react';
import { View, Image, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Card } from '../Card';
import { Text } from '../Text';
import { getDispenserEligibility } from '@/api/dispenser';
import { buildSlots, type DispenserSlot, type Eligibility } from '@/types';
import { useSettingsStore } from '@/store/settingsStore';
import { colors } from '@/constants/colors';
import { useTranslation } from '@/i18n';

const REFRESH_INTERVAL_MS = 60_000;
const PARASITE_BASE = 'https://parasite.space';

export interface MiningRewardCardProps {
  className?: string;
}

export function MiningRewardCard({ className = '' }: MiningRewardCardProps) {
  const { t } = useTranslation();
  const bitcoinAddress = useSettingsStore((s) => s.bitcoinAddress);
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);

  useEffect(() => {
    if (!bitcoinAddress) {
      setEligibility(null);
      return;
    }

    let cancelled = false;

    const fetchOnce = async () => {
      const result = await getDispenserEligibility(bitcoinAddress);
      if (cancelled) return;
      if (result.success) {
        setEligibility(result.data);
      }
    };

    fetchOnce();
    const id = setInterval(fetchOnce, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [bitcoinAddress]);

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

  return (
    <View className="bg-background border border-border rounded-md p-2">
      <Pressable onPress={handlePress} hitSlop={4}>
        <Image
          source={{ uri: `https://ordinals.com/content/${slot.inscriptionId}` }}
          style={{ width: '100%', aspectRatio: 1, backgroundColor: 'transparent' }}
          resizeMode="contain"
        />
      </Pressable>

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
        <Pressable
          onPress={handlePress}
          hitSlop={6}
          className="flex-row items-center gap-1 border border-border rounded px-1.5 py-0.5"
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Ionicons
            name={slot.claimed ? 'link-outline' : 'open-outline'}
            size={11}
            color={colors.textMuted}
          />
          <Text variant="caption" color="muted" className="text-[10px]">
            {slot.claimed
              ? t('home.miningRewardLink')
              : t('home.miningRewardClaimOnWeb')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
