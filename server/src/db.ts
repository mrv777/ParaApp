import type { NotificationPreferences, UserState, PoolState, PushSubscription } from './types';

const MAX_DEVICES_PER_ADDRESS = 10;

export class MaxDevicesExceededError extends Error {
  constructor() {
    super('Maximum of 10 devices per address');
    this.name = 'MaxDevicesExceededError';
  }
}

export async function upsertSubscription(
  db: D1Database,
  pushToken: string,
  btcAddress: string,
  options?: { widgetUpdatesEnabled?: boolean; notificationsEnabled?: boolean }
): Promise<void> {
  // Check if this token already exists (update case - no limit needed)
  const existing = await db
    .prepare('SELECT id FROM push_subscriptions WHERE push_token = ?')
    .bind(pushToken)
    .first();

  if (!existing) {
    // New token - check device limit
    const count = await db
      .prepare(
        'SELECT COUNT(*) as count FROM push_subscriptions WHERE btc_address = ? AND active = 1'
      )
      .bind(btcAddress)
      .first<{ count: number }>();

    if (count && count.count >= MAX_DEVICES_PER_ADDRESS) {
      throw new MaxDevicesExceededError();
    }
  }

  // notifications_enabled defaults to 1 (enabled) when the caller doesn't
  // specify it, matching the column default; only an explicit `false` disables.
  const notificationsEnabled = options?.notificationsEnabled === false ? 0 : 1;

  await db
    .prepare(
      `
      INSERT INTO push_subscriptions (push_token, btc_address, active, widget_updates_enabled, notifications_enabled, updated_at)
      VALUES (?, ?, 1, ?, ?, unixepoch())
      ON CONFLICT(push_token) DO UPDATE SET
        btc_address = excluded.btc_address,
        active = 1,
        widget_updates_enabled = excluded.widget_updates_enabled,
        notifications_enabled = excluded.notifications_enabled,
        updated_at = unixepoch()
    `
    )
    .bind(
      pushToken,
      btcAddress,
      options?.widgetUpdatesEnabled ? 1 : 0,
      notificationsEnabled
    )
    .run();
}

export async function deleteSubscription(
  db: D1Database,
  pushToken: string
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM push_subscriptions WHERE push_token = ?')
    .bind(pushToken)
    .run();
  return result.meta.changes > 0;
}

/**
 * Verify that a push token is registered to a specific address
 */
export async function verifyTokenOwnership(
  db: D1Database,
  pushToken: string,
  btcAddress: string
): Promise<boolean> {
  const result = await db
    .prepare(
      'SELECT 1 FROM push_subscriptions WHERE push_token = ? AND btc_address = ? AND active = 1'
    )
    .bind(pushToken, btcAddress)
    .first();
  return result !== null;
}

export async function upsertPreferences(
  db: D1Database,
  btcAddress: string,
  prefs: { blocks?: boolean; workers?: boolean; bestDiff?: boolean }
): Promise<void> {
  const blocks = prefs.blocks !== undefined ? (prefs.blocks ? 1 : 0) : null;
  const workers = prefs.workers !== undefined ? (prefs.workers ? 1 : 0) : null;
  const bestDiff = prefs.bestDiff !== undefined ? (prefs.bestDiff ? 1 : 0) : null;

  // One atomic statement covers every state:
  // - missing row: undefined fields receive the schema's enabled-by-default value
  // - existing row: undefined fields preserve their current value
  // - explicit false: 0 is preserved by COALESCE and never mistaken for missing
  await db
    .prepare(
      `
      INSERT INTO notification_preferences (
        btc_address,
        notify_blocks,
        notify_workers,
        notify_best_diff
      )
      VALUES (?, COALESCE(?, 1), COALESCE(?, 1), COALESCE(?, 1))
      ON CONFLICT(btc_address) DO UPDATE SET
        notify_blocks = COALESCE(?, notification_preferences.notify_blocks),
        notify_workers = COALESCE(?, notification_preferences.notify_workers),
        notify_best_diff = COALESCE(?, notification_preferences.notify_best_diff),
        updated_at = unixepoch()
    `
    )
    .bind(
      btcAddress,
      blocks,
      workers,
      bestDiff,
      blocks,
      workers,
      bestDiff
    )
    .run();
}

/**
 * Seed a preferences row from the submitted prefs ONLY if none exists; never
 * overwrite an existing row. Used by device registration, which must not clobber
 * an account-wide preference that may have been set OFF on another device.
 * Explicit user changes go through upsertPreferences (PATCH /preferences).
 * ON CONFLICT DO NOTHING makes this a safe no-op when a row already exists
 * (btc_address is the PK), avoiding a check-then-insert race.
 */
export async function ensurePreferences(
  db: D1Database,
  btcAddress: string,
  prefs: { blocks?: boolean; workers?: boolean; bestDiff?: boolean }
): Promise<void> {
  await db
    .prepare(
      `
      INSERT INTO notification_preferences (btc_address, notify_blocks, notify_workers, notify_best_diff)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(btc_address) DO NOTHING
    `
    )
    .bind(
      btcAddress,
      prefs.blocks !== undefined ? (prefs.blocks ? 1 : 0) : 1,
      prefs.workers !== undefined ? (prefs.workers ? 1 : 0) : 1,
      prefs.bestDiff !== undefined ? (prefs.bestDiff ? 1 : 0) : 1
    )
    .run();
}

export async function updateSubscriptionWidgetUpdates(
  db: D1Database,
  pushToken: string,
  btcAddress: string,
  enabled: boolean
): Promise<void> {
  await db
    .prepare(
      `UPDATE push_subscriptions
       SET widget_updates_enabled = ?, updated_at = unixepoch()
       WHERE push_token = ? AND btc_address = ? AND active = 1`
    )
    .bind(enabled ? 1 : 0, pushToken, btcAddress)
    .run();
}

export async function updateSubscriptionNotificationsEnabled(
  db: D1Database,
  pushToken: string,
  btcAddress: string,
  enabled: boolean
): Promise<void> {
  await db
    .prepare(
      `UPDATE push_subscriptions
       SET notifications_enabled = ?, updated_at = unixepoch()
       WHERE push_token = ? AND btc_address = ? AND active = 1`
    )
    .bind(enabled ? 1 : 0, pushToken, btcAddress)
    .run();
}

export async function getPreferences(
  db: D1Database,
  btcAddress: string
): Promise<NotificationPreferences | null> {
  return db
    .prepare('SELECT * FROM notification_preferences WHERE btc_address = ?')
    .bind(btcAddress)
    .first<NotificationPreferences>();
}

/** Load all account-wide preferences in one query for block fan-out. */
export async function getAllPreferences(
  db: D1Database
): Promise<NotificationPreferences[]> {
  const result = await db
    .prepare('SELECT * FROM notification_preferences')
    .all<NotificationPreferences>();
  return result.results;
}

// ============================================
// Cron Job Support Functions
// ============================================

/**
 * Mark a push token as inactive (e.g., when Expo returns DeviceNotRegistered)
 */
export async function markTokenInactive(
  db: D1Database,
  pushToken: string
): Promise<void> {
  await db
    .prepare('UPDATE push_subscriptions SET active = 0, updated_at = unixepoch() WHERE push_token = ?')
    .bind(pushToken)
    .run();
}

/**
 * Get all active subscriptions (for pool-wide notifications)
 */
export async function getAllActiveSubscriptions(
  db: D1Database
): Promise<PushSubscription[]> {
  const result = await db
    .prepare('SELECT * FROM push_subscriptions WHERE active = 1')
    .all<PushSubscription>();
  return result.results;
}

export async function getSubscriptionsDueForWidgetPush(
  db: D1Database,
  minIntervalSeconds: number
): Promise<PushSubscription[]> {
  const result = await db
    .prepare(
      `SELECT * FROM push_subscriptions
       WHERE active = 1
         AND widget_updates_enabled = 1
         AND (last_widget_push_at IS NULL OR last_widget_push_at <= unixepoch() - ?)`
    )
    .bind(minIntervalSeconds)
    .all<PushSubscription>();
  return result.results;
}

export async function markWidgetPushSent(
  db: D1Database,
  pushTokens: string[]
): Promise<void> {
  if (pushTokens.length === 0) return;

  // D1 accepts at most 100 bound parameters. One UPDATE per chunk reduces
  // hundreds of sequential round-trips to a handful.
  const uniqueTokens = [...new Set(pushTokens)];
  for (let i = 0; i < uniqueTokens.length; i += 100) {
    const chunk = uniqueTokens.slice(i, i + 100);
    const placeholders = chunk.map(() => '?').join(', ');
    await db
      .prepare(
        `UPDATE push_subscriptions
         SET last_widget_push_at = unixepoch(), updated_at = unixepoch()
         WHERE push_token IN (${placeholders})`
      )
      .bind(...chunk)
      .run();
  }
}

/**
 * Get user state for change detection
 */
export async function getUserState(
  db: D1Database,
  btcAddress: string
): Promise<UserState | null> {
  return db
    .prepare('SELECT * FROM user_state WHERE btc_address = ?')
    .bind(btcAddress)
    .first<UserState>();
}

/**
 * Upsert user state
 */
export async function upsertUserState(
  db: D1Database,
  btcAddress: string,
  workerStatuses: string,
  bestDifficulty: string
): Promise<void> {
  await db
    .prepare(
      `
      INSERT INTO user_state (btc_address, worker_statuses, best_difficulty, last_checked)
      VALUES (?, ?, ?, unixepoch())
      ON CONFLICT(btc_address) DO UPDATE SET
        worker_statuses = excluded.worker_statuses,
        best_difficulty = excluded.best_difficulty,
        last_checked = unixepoch()
    `
    )
    .bind(btcAddress, workerStatuses, bestDifficulty)
    .run();
}

/**
 * Get pool state for block detection
 */
export async function getPoolState(db: D1Database): Promise<PoolState | null> {
  return db.prepare('SELECT * FROM pool_state WHERE id = 1').first<PoolState>();
}

/**
 * Atomically claim a new block height.
 *
 * The conditional UPDATE only mutates the row when the stored block time is
 * still behind `lastBlockTime`, so concurrent or double-dispatched cron runs
 * race on a single SQL statement instead of a read-then-write. Returns true
 * only for the run that actually advanced the row — that run owns sending the
 * notifications, guaranteeing each device is alerted exactly once.
 */
export async function updatePoolState(
  db: D1Database,
  lastBlockTime: string | null
): Promise<boolean> {
  const result = await db
    .prepare(
      'UPDATE pool_state SET last_block_time = ?, updated_at = unixepoch() WHERE id = 1 AND (last_block_time IS NULL OR last_block_time != ?)'
    )
    .bind(lastBlockTime, lastBlockTime)
    .run();
  return (result.meta?.changes ?? 0) === 1;
}

/**
 * Single-flight guard for the cron. Atomically records this scheduled tick and
 * returns true only for the first caller.
 *
 * Cloudflare can occasionally dispatch the same scheduled event more than once;
 * duplicate dispatches share the same `scheduledTime`, so the loser sees
 * changes=0 and skips the entire run — preventing duplicate worker/best-diff
 * (and block) notifications that the per-resource read-then-write would emit.
 *
 * Callers must FAIL OPEN on error: this is a best-effort de-dup, never a single
 * point of failure for delivery. The per-block atomic claim still prevents
 * duplicate block alerts on its own.
 */
export async function claimCronTick(
  db: D1Database,
  scheduledTime: number
): Promise<boolean> {
  const result = await db
    .prepare('INSERT OR IGNORE INTO cron_runs (scheduled_time) VALUES (?)')
    .bind(scheduledTime)
    .run();
  return (result.meta?.changes ?? 0) === 1;
}

/**
 * Trim old cron-run rows so the single-flight table stays small (one row per
 * minute would otherwise grow unbounded).
 */
export async function pruneCronRuns(
  db: D1Database,
  olderThanMs: number
): Promise<void> {
  await db
    .prepare('DELETE FROM cron_runs WHERE scheduled_time < ?')
    .bind(olderThanMs)
    .run();
}

export async function getWidgetPoolSnapshot(
  db: D1Database
): Promise<{ snapshot_json: string; fetched_at: number } | null> {
  return db
    .prepare('SELECT snapshot_json, fetched_at FROM widget_pool_snapshot WHERE id = 1')
    .first<{ snapshot_json: string; fetched_at: number }>();
}

export async function upsertWidgetPoolSnapshot(
  db: D1Database,
  snapshotJson: string,
  fetchedAt: number
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO widget_pool_snapshot (id, snapshot_json, fetched_at, updated_at)
       VALUES (1, ?, ?, unixepoch())
       ON CONFLICT(id) DO UPDATE SET
         snapshot_json = excluded.snapshot_json,
         fetched_at = excluded.fetched_at,
         updated_at = unixepoch()`
    )
    .bind(snapshotJson, fetchedAt)
    .run();
}

export async function getWidgetUserSnapshot(
  db: D1Database,
  btcAddress: string
): Promise<{ snapshot_json: string; fetched_at: number } | null> {
  return db
    .prepare(
      'SELECT snapshot_json, fetched_at FROM widget_user_snapshots WHERE btc_address = ?'
    )
    .bind(btcAddress)
    .first<{ snapshot_json: string; fetched_at: number }>();
}

export async function upsertWidgetUserSnapshot(
  db: D1Database,
  btcAddress: string,
  snapshotJson: string,
  fetchedAt: number
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO widget_user_snapshots (btc_address, snapshot_json, fetched_at, updated_at)
       VALUES (?, ?, ?, unixepoch())
       ON CONFLICT(btc_address) DO UPDATE SET
         snapshot_json = excluded.snapshot_json,
         fetched_at = excluded.fetched_at,
         updated_at = unixepoch()`
    )
    .bind(btcAddress, snapshotJson, fetchedAt)
    .run();
}
