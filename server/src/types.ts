export interface Env {
  DB: D1Database;
  PARASITE_API_URL: string;
  // Community chat
  CHAT_ROOM: DurableObjectNamespace;
  SESSION_SECRET: string; // HMAC key for chat session tokens
  ADMIN_SECRET: string; // guards /chat/admin/* routes + web admin page
  CHAT_MODERATION_AI: string; // "off" | "on" — AI moderation toggle (v1: off)
}

export interface PushSubscription {
  id: number;
  push_token: string;
  btc_address: string;
  active: number; // 1 or 0
  widget_updates_enabled: number;
  notifications_enabled: number; // 1 or 0 — per-device master toggle
  notify_blocks: number; // 1 or 0 — per-device category toggles
  notify_workers: number;
  notify_best_diff: number;
  notify_rewards: number;
  last_widget_push_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface SubscriptionPreferences {
  notify_blocks: number;
  notify_workers: number;
  notify_best_diff: number;
  notify_rewards: number;
}

export interface NotificationPreferences {
  btc_address: string;
  notify_blocks: number; // 1 or 0
  notify_workers: number;
  notify_best_diff: number;
  notify_rewards: number;
  updated_at: number;
}

export interface UserState {
  btc_address: string;
  worker_statuses: string | null; // JSON string of WorkerStatusMap
  best_difficulty: string | null; // User's overall best difficulty (e.g., "1.12T")
  dispenser_state: string | null; // JSON watermark of per-tier assigned-slot counts
  last_checked: number | null;
}

export interface PoolState {
  id: number;
  last_block_time: string | null;
  updated_at: number;
}

// Worker status tracking for offline detection
export interface WorkerStatusEntry {
  offlineChecks: number; // Consecutive offline checks (0-5)
  notifiedOffline: boolean; // Whether we already sent offline notification
  // Offline crossing withheld by the flap cooldown (absorbed if it recovers,
  // sent late if it outlives the cooldown)
  suppressedOffline?: boolean;
  // No new offline/online pair until this epoch second; refreshed on recovery.
  // Absent on entries written before flap damping shipped.
  cooldownUntil?: number;
}

export type WorkerStatusMap = Record<string, WorkerStatusEntry>;

// ============================================
// Parasite Pool API Types
// ============================================

export interface ParasiteWorker {
  id: string;
  name: string;
  hashrate: string;
  bestDifficulty: string;
  lastSubmission: string; // Unix timestamp in seconds
  uptime: string;
}

export interface ParasiteUserResponse {
  hashrate: number;
  workers: number;
  lastSubmission: string;
  bestDifficulty: string; // e.g., "1.12T"
  uptime: string;
  workerData: ParasiteWorker[];
}

export interface ParasitePoolStatsResponse {
  uptime: string;
  lastBlockTime: string | null; // Block height string (e.g., "938713") or null
  lastBlockHash: string | null;
  highestDifficulty: string;
  hashrate: number;
  users: number;
  workers: number;
}

// Dispenser eligibility (only the fields the reward diff needs; the endpoint
// returns more). 404 = address unknown to the dispenser = zero slots.
// Admin/whitelist grants appear as the "override" tier once assigned; the
// payload's separate `override_slots` grant counter is intentionally unused.
export interface DispenserEligibilityResponse {
  assigned_inscription_ids?: Record<string, string[]>;
}

export interface DispenserTier {
  name: string;
  asset: string;
}

// ============================================
// Expo Push API Types
// ============================================

export interface ExpoPushMessage {
  to: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
  priority?: 'default' | 'normal' | 'high';
  _contentAvailable?: boolean;
}

export interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: {
    error?: 'DeviceNotRegistered' | 'InvalidCredentials' | 'MessageTooBig' | 'MessageRateExceeded';
  };
}
