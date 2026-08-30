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
  notifications_enabled INTEGER DEFAULT 1,
  notify_blocks INTEGER NOT NULL DEFAULT 1,
  notify_workers INTEGER NOT NULL DEFAULT 1,
  notify_best_diff INTEGER NOT NULL DEFAULT 1,
  notify_rewards INTEGER NOT NULL DEFAULT 1,
  last_widget_push_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Legacy per-address preferences. Existing deployments retain this table for
-- rollback compatibility; active code stores category preferences per device
-- in push_subscriptions so one device cannot change another device's alerts.
CREATE TABLE IF NOT EXISTS notification_preferences (
  btc_address TEXT PRIMARY KEY,
  notify_blocks INTEGER DEFAULT 1,
  notify_workers INTEGER DEFAULT 1,
  notify_best_diff INTEGER DEFAULT 1,
  notify_rewards INTEGER DEFAULT 1,
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Track last known state for change detection (Phase 2)
CREATE TABLE IF NOT EXISTS user_state (
  btc_address TEXT PRIMARY KEY,
  worker_statuses TEXT,  -- JSON: {"worker1": {"offlineChecks": 0, "notifiedOffline": false}}
  best_difficulty TEXT,  -- User's overall best difficulty (e.g., "1.12T")
  dispenser_state TEXT,  -- JSON watermark: {"tier": assignedCount}; NULL = no baseline yet
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

-- ============================================================================
-- Community chat (see migrations/0005_add_chat_schema.sql). chat_messages.created_at
-- is MILLISECONDS to match the WS `ts` field; other *_at columns are seconds.
-- ============================================================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0,
  reply_to TEXT              -- parent message id when this is a reply (see 0009)
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
-- Supports admin sender search and ban-purge (migration 0010).
CREATE INDEX IF NOT EXISTS idx_chat_messages_address ON chat_messages(address, created_at);

CREATE TABLE IF NOT EXISTS chat_reactions (
  message_id TEXT NOT NULL,
  address TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (message_id, address, emoji)
);
CREATE INDEX IF NOT EXISTS idx_chat_reactions_message ON chat_reactions(message_id);

-- norm/official added by migration 0007: norm is the canonical nickname key
-- (confusable-folded) backing global uniqueness; official marks admin-assigned
-- locked handles. Legacy rows keep norm = NULL (excluded from the index).
CREATE TABLE IF NOT EXISTS chat_profiles (
  address TEXT PRIMARY KEY,
  nickname TEXT,
  updated_at INTEGER DEFAULT (unixepoch()),
  norm TEXT,
  official INTEGER DEFAULT 0,
  badges TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_profiles_norm
  ON chat_profiles(norm) WHERE norm IS NOT NULL;

CREATE TABLE IF NOT EXISTS chat_blocks (
  blocker TEXT NOT NULL,
  blocked TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (blocker, blocked)
);

CREATE TABLE IF NOT EXISTS chat_reports (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  reporter TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  resolved INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_chat_reports_resolved ON chat_reports(resolved, created_at);
-- One report per (message, reporter); INSERT OR IGNORE makes re-reports no-ops
-- (migration 0008).
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_reports_unique ON chat_reports(message_id, reporter);

CREATE TABLE IF NOT EXISTS chat_bans (
  address TEXT PRIMARY KEY,
  reason TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  expires_at INTEGER         -- seconds epoch; NULL = permanent (see 0010)
);

CREATE TABLE IF NOT EXISTS chat_eula_accept (
  address TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  accepted_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS chat_announcement (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  body TEXT,
  updated_at INTEGER DEFAULT (unixepoch())
);
INSERT OR IGNORE INTO chat_announcement (id, body) VALUES (1, NULL);

-- Admin moderation audit trail (migration 0010).
CREATE TABLE IF NOT EXISTS chat_admin_audit (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_chat_admin_audit_created ON chat_admin_audit(created_at);
