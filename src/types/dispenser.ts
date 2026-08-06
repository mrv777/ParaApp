/**
 * Parasite Pool Dispenser types
 *
 * The dispenser awards Ordinals inscriptions to miners as mining rewards.
 * See parasitepool/parastats `app/api/dispenser/eligibility/[username]/route.ts`.
 */

export interface Eligibility {
  username: string;
  tier_shares: Record<string, number>;
  override_slots: number;
  total_slots: number;
  assigned_utxos: Record<string, string[]>;
  assigned_inscription_ids: Record<string, string[]>;
  claims: Record<string, number[]>;
}

/** Tier definition from /api/dispenser/tiers. Thresholds are raw difficulty. */
export interface TierInfo {
  name: string;
  threshold: number;
  asset: string;
  start_height?: number;
  end_height?: number;
}

/** Asset definition from /api/dispenser/assets. */
export interface AssetInfo {
  name: string;
  description?: string;
  kind: string;
  total_utxos: number;
  assigned: number;
  is_override_asset: boolean;
}

/** One row of the "Available Rewards" catalog. */
export interface RewardCatalogEntry {
  name: string;
  description?: string;
  /** Lowest share-difficulty target for this reward (raw difficulty). */
  threshold: number;
  /** Units still unassigned in the pool. */
  remaining: number;
  /** Total units minted for this asset. */
  total: number;
}

/**
 * Build the rewards catalog: only assets with pool remaining, each paired with
 * the lowest tier threshold that awards it, sorted easiest-first.
 * Ported from parastats `app/components/dispenser/DispenserRewards.tsx#buildRewards`.
 */
export function buildRewardCatalog(
  assets: AssetInfo[],
  tiers: TierInfo[]
): RewardCatalogEntry[] {
  const rewards: RewardCatalogEntry[] = [];
  for (const asset of assets) {
    if (asset.assigned >= asset.total_utxos) continue;
    const assetTiers = tiers.filter((tier) => tier.asset === asset.name);
    if (assetTiers.length === 0) continue;
    rewards.push({
      name: asset.name,
      description: asset.description,
      threshold: Math.min(...assetTiers.map((tier) => tier.threshold)),
      remaining: asset.total_utxos - asset.assigned,
      total: asset.total_utxos,
    });
  }
  return rewards.sort((a, b) => a.threshold - b.threshold);
}

/**
 * A live (open/extended) auction from /api/dispenser/auctions — a slot that
 * appears here is currently biddable on the Parabid auction house.
 */
export interface LiveAuction {
  id: string;
  inscription_id: string;
  outpoint: string;
  /** Unix seconds */
  end_time: number;
  /** Highest bid in sats; null = no bids yet */
  current_high: number | null;
  min_next_bid: number;
}

/**
 * Index auctions by both inscription id and outpoint so a slot resolves via
 * either identifier. Ported from parastats DispenserClaim.tsx.
 */
export function buildAuctionIndex(auctions: LiveAuction[]): Map<string, LiveAuction> {
  const index = new Map<string, LiveAuction>();
  for (const auction of auctions) {
    if (auction.inscription_id) index.set(auction.inscription_id, auction);
    if (auction.outpoint) index.set(auction.outpoint, auction);
  }
  return index;
}

/** Resolve the live auction (if any) for a slot. */
export function findSlotAuction(
  index: Map<string, LiveAuction>,
  slot: DispenserSlot
): LiveAuction | null {
  return (
    (slot.inscriptionId ? index.get(slot.inscriptionId) : undefined) ??
    (slot.utxo ? index.get(slot.utxo) : undefined) ??
    null
  );
}

export interface DispenserSlot {
  tier: string;
  utxo: string | null;
  inscriptionId: string;
  claimed: boolean;
  /** Flat index across all tiers — stable key for lists */
  index: number;
  /** Index within the tier (used by the website's claim API) */
  tierSlotIndex: number;
}

/**
 * Flatten the tier-keyed maps into a single ordered slot list.
 * Ported from parastats `app/components/dispenser/DispenserClaim.tsx#buildSlots`.
 */
export function buildSlots(data: Eligibility): DispenserSlot[] {
  const slots: DispenserSlot[] = [];
  for (const [tier, inscriptionIds] of Object.entries(data.assigned_inscription_ids ?? {})) {
    const utxos = data.assigned_utxos?.[tier] ?? [];
    const claimedIndices = new Set(data.claims?.[tier] ?? []);
    for (let i = 0; i < inscriptionIds.length; i++) {
      slots.push({
        tier,
        utxo: utxos[i] ?? null,
        inscriptionId: inscriptionIds[i],
        claimed: claimedIndices.has(i),
        tierSlotIndex: i,
        index: slots.length,
      });
    }
  }
  return slots;
}
