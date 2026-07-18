/**
 * Parasite Pool Refinery (router) types — read-only order monitoring.
 *
 * The Refinery is Parasite's hashrate marketplace: users pay BTC to direct
 * pool hashrate at their `.refinery` worker. Order creation and payment are
 * website-only (wallet required); the app just monitors existing orders.
 * Ported from parastats `app/api/router/types.ts`.
 */

export type RefineryOrderStatus =
  | 'pending'
  | 'in_mempool'
  | 'active'
  | 'fulfilled'
  | 'cancelled'
  | 'disconnected'
  | 'expired';

export type RefineryReview = 'clean' | 'flagged' | 'cleared';

export interface RefineryMiningStats {
  hashrate_1m: number;
  hashrate_5m: number;
  hashrate_15m: number;
  hashrate_1hr: number;
  hashrate_6hr: number;
  hashrate_1d: number;
  hashrate_7d: number;
  sps_1m: number;
  sps_5m: number;
  sps_15m: number;
  sps_1hr: number;
  best_share: number | null;
  last_share: number | null;
  accepted_shares: number;
  rejected_shares: number;
  accepted_work: number;
  rejected_work: number;
  delivered_hash_days: number;
}

export interface RefineryUpstreamTarget {
  endpoint: string;
  username: string;
  password: string | null;
}

export interface RefineryOrderSummary {
  id: number;
  status: RefineryOrderStatus;
  review: RefineryReview;
  endpoint: string;
  username: string;
  /** Raw hash-days (1 PHd = 1e15); null = unlimited */
  requested_hash_days: number | null;
  hashrate: number;
  delivered_hash_days: number;
  best_share: number | null;
}

export interface RefineryOrderDetail {
  id: number;
  status: RefineryOrderStatus;
  review: RefineryReview;
  upstream_target: RefineryUpstreamTarget;
  requested_hash_days: number | null;
  hash_price: number | null;
  payment_address: string | null;
  payment_amount: number | null;
  txids: string[];
  /** Unix seconds */
  created_at: number;
  created_at_height: number | null;
  upstream: RefineryMiningStats;
  downstream: RefineryMiningStats;
}
