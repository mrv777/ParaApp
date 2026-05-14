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
