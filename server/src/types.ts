export interface Env {
  DB: D1Database;
  PARASITE_API_URL: string;
}

export interface PushSubscription {
  id: number;
  push_token: string;
  btc_address: string;
  active: number; // 1 or 0
  created_at: number;
  updated_at: number;
}

export interface NotificationPreferences {
  btc_address: string;
  notify_blocks: number; // 1 or 0
  notify_workers: number;
  notify_best_diff: number;
  updated_at: number;
}

export interface UserState {
  btc_address: string;
  worker_statuses: string | null; // JSON string of WorkerStatusMap
  best_difficulty: string | null; // User's overall best difficulty (e.g., "1.12T")
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
  isPublic: boolean;
  workerData: ParasiteWorker[];
}

export interface ParasitePoolStatsResponse {
  uptime: string;
  lastBlockTime: string; // e.g., "N/A" or timestamp
  highestDifficulty: string;
  hashrate: number;
  users: number;
  workers: number;
}

// ============================================
// Expo Push API Types
// ============================================

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
  priority?: 'default' | 'normal' | 'high';
}

export interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: {
    error?: 'DeviceNotRegistered' | 'InvalidCredentials' | 'MessageTooBig' | 'MessageRateExceeded';
  };
}
