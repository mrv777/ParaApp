-- Full schema for a FRESH database. Idempotent (safe to re-run) for fresh setup.
-- For INCREMENTAL changes to an already-deployed database, add a delta file under
-- migrations/ (CREATE TABLE IF NOT EXISTS won't add columns to an existing table).

-- Push notification subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  push_token TEXT NOT NULL UNIQUE,
  btc_address TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  widget_updates_enabled INTEGER DEFAULT 0,
  last_widget_push_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Per-user notification preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  btc_address TEXT PRIMARY KEY,
  notify_blocks INTEGER DEFAULT 1,
  notify_workers INTEGER DEFAULT 1,
  notify_best_diff INTEGER DEFAULT 1,
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Track last known state for change detection (Phase 2)
CREATE TABLE IF NOT EXISTS user_state (
  btc_address TEXT PRIMARY KEY,
  worker_statuses TEXT,  -- JSON: {"worker1": {"offlineChecks": 0, "notifiedOffline": false}}
  best_difficulty TEXT,  -- User's overall best difficulty (e.g., "1.12T")
  last_checked INTEGER
);

-- Track pool-wide state for block detection
CREATE TABLE IF NOT EXISTS pool_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_block_time TEXT,
  updated_at INTEGER DEFAULT (unixepoch())
);
INSERT OR IGNORE INTO pool_state (id, last_block_time) VALUES (1, NULL);

-- Single-flight guard: one row per processed cron tick (scheduledTime in ms).
-- A duplicate dispatch of the same tick collides on the primary key and is
-- skipped, preventing duplicate notifications. Pruned to ~1h of history.
CREATE TABLE IF NOT EXISTS cron_runs (
  scheduled_time INTEGER PRIMARY KEY,
  created_at INTEGER DEFAULT (unixepoch())
);

-- Latest widget snapshots, refreshed by cron and on-demand endpoints
CREATE TABLE IF NOT EXISTS widget_pool_snapshot (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  snapshot_json TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS widget_user_snapshots (
  btc_address TEXT PRIMARY KEY,
  snapshot_json TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Indexes
-- Composite (btc_address, active) serves by-address active-subscription lookups
-- without falling back to the low-cardinality `active` index (see migration
-- 0003). It also covers plain btc_address lookups via its leading column.
CREATE INDEX IF NOT EXISTS idx_subscriptions_addr_active ON push_subscriptions(btc_address, active);
CREATE INDEX IF NOT EXISTS idx_subscriptions_active ON push_subscriptions(active);
CREATE INDEX IF NOT EXISTS idx_subscriptions_widget_updates ON push_subscriptions(widget_updates_enabled, last_widget_push_at);
