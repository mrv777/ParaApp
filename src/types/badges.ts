/**
 * Parasite Pool badges — canonical payload served by
 * `GET /api/user/{address}/badges` (parastats "Badge Reform").
 * Ported from parastats `lib/badge-types.ts`, which mirrors the Rust structs
 * in para's badge handling.
 */

export const BLOCK_BADGE_ID = 'block';
export const BLOCK_WINNER_BADGE_ID = 'block_winner';
export const LOYALTY_BADGE_ID = 'loyalty';
export const REFINERY_BADGE_ID = 'refinery';
export const DISPENSER_BADGE_ID = 'dispenser';
export const BRAVOCADO_BADGE_ID = 'bravocado';
export const MINER_BADGE_ID = 'miner';
export const AUCTION_WINNER_BADGE_ID = 'auction_winner';

/** Blocks of participation per loyalty instance. */
export const LOYALTY_BLOCKS_PER_INSTANCE = 21_000;

export interface BadgeInstance {
  blockheight: number;
}

export interface BadgeBucket {
  count: number;
}

export interface BadgeType {
  /** Stacking policy, e.g. "unique_then_bucket". */
  kind: string;
  /** Individually-earned, non-stacking instances (earliest few). */
  unique: BadgeInstance[];
  /** Everything beyond the unique cap, collapsed into a stacking count. */
  bucket: BadgeBucket;
  /** Total earned across unique + bucket. */
  total: number;
}

export interface BadgesPayload {
  version: number;
  computed_at: string;
  /** Max found-block height at compute time (cache-invalidation fingerprint). */
  source_tip?: number;
  /** Number of rows in `blocks` at compute time (paired with source_tip). */
  source_blocks?: number;
  /** Keyed by badge id (e.g. "block"). */
  types: Record<string, BadgeType>;
}

/** Flattened per-kind view of a payload (mirrors parastats BadgeDisplay). */
export interface BadgeCounts {
  /** Blocks this miner's share actually solved (trophy medals). */
  winners: BadgeInstance[];
  /** Individually-displayed mined blocks (pickaxe medals). */
  blockUnique: BadgeInstance[];
  /** Mined blocks beyond the unique cap, collapsed into one stacked medal. */
  blockStacked: number;
  loyalty: number;
  auctionWins: number;
  bravocado: number;
  miner: number;
  dispenser: number;
  refinery: number;
}

export function extractBadgeCounts(payload: BadgesPayload | null): BadgeCounts {
  const types = payload?.types ?? {};
  return {
    winners: types[BLOCK_WINNER_BADGE_ID]?.unique ?? [],
    blockUnique: types[BLOCK_BADGE_ID]?.unique ?? [],
    blockStacked: types[BLOCK_BADGE_ID]?.bucket?.count ?? 0,
    loyalty: types[LOYALTY_BADGE_ID]?.bucket?.count ?? 0,
    auctionWins: types[AUCTION_WINNER_BADGE_ID]?.bucket?.count ?? 0,
    bravocado: types[BRAVOCADO_BADGE_ID]?.bucket?.count ?? 0,
    miner: types[MINER_BADGE_ID]?.bucket?.count ?? 0,
    dispenser: types[DISPENSER_BADGE_ID]?.bucket?.count ?? 0,
    refinery: types[REFINERY_BADGE_ID]?.bucket?.count ?? 0,
  };
}

export function hasAnyBadge(counts: BadgeCounts): boolean {
  return (
    counts.winners.length > 0 ||
    counts.blockUnique.length > 0 ||
    counts.blockStacked > 0 ||
    counts.loyalty > 0 ||
    counts.auctionWins > 0 ||
    counts.bravocado > 0 ||
    counts.miner > 0 ||
    counts.dispenser > 0 ||
    counts.refinery > 0
  );
}

/** Stacking badge kinds rendered as a single medal with an optional count chip. */
export type StackedBadgeKind =
  | 'block_stack'
  | 'loyalty'
  | 'auction_winner'
  | 'bravocado'
  | 'miner'
  | 'dispenser'
  | 'refinery';

/** Kinds whose count chip is never shown (count still gates rendering). */
export const HIDDEN_COUNT_KINDS: ReadonlySet<StackedBadgeKind> = new Set([
  'bravocado',
  'miner',
  'refinery',
]);

export type BadgeMedalDescriptor =
  | { key: string; type: 'winner'; blockHeight: number }
  | { key: string; type: 'block'; blockHeight: number }
  | { key: string; type: 'stacked'; kind: StackedBadgeKind; count: number };

/**
 * Ordered medal list for a payload — the single source of truth for what the
 * badge row shows and how many medals exist. Order matches parastats
 * BadgeDisplay: winners → block unique → block stacked → loyalty →
 * auction_winner → bravocado → miner → dispenser → refinery.
 */
export function buildBadgeMedals(counts: BadgeCounts): BadgeMedalDescriptor[] {
  const medals: BadgeMedalDescriptor[] = [];
  for (const instance of counts.winners) {
    medals.push({ key: `w-${instance.blockheight}`, type: 'winner', blockHeight: instance.blockheight });
  }
  for (const instance of counts.blockUnique) {
    medals.push({ key: `b-${instance.blockheight}`, type: 'block', blockHeight: instance.blockheight });
  }
  const stacked: [StackedBadgeKind, number][] = [
    ['block_stack', counts.blockStacked],
    ['loyalty', counts.loyalty],
    ['auction_winner', counts.auctionWins],
    ['bravocado', counts.bravocado],
    ['miner', counts.miner],
    ['dispenser', counts.dispenser],
    ['refinery', counts.refinery],
  ];
  for (const [kind, count] of stacked) {
    if (count > 0) medals.push({ key: kind, type: 'stacked', kind, count });
  }
  return medals;
}
