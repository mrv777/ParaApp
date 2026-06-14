-- Push notification subscriptions
CREATE TABLE push_subscriptions (
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
CREATE TABLE notification_preferences (
  btc_address TEXT PRIMARY KEY,
  notify_blocks INTEGER DEFAULT 1,
  notify_workers INTEGER DEFAULT 1,
  notify_best_diff INTEGER DEFAULT 1,
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Track last known state for change detection (Phase 2)
CREATE TABLE user_state (
  btc_address TEXT PRIMARY KEY,
  worker_statuses TEXT,  -- JSON: {"worker1": {"offlineChecks": 0, "notifiedOffline": false}}
  best_difficulty TEXT,  -- User's overall best difficulty (e.g., "1.12T")
  last_checked INTEGER
);

-- Track pool-wide state for block detection
CREATE TABLE pool_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_block_time TEXT,
  updated_at INTEGER DEFAULT (unixepoch())
);
INSERT INTO pool_state (id, last_block_time) VALUES (1, NULL);

-- Latest widget snapshots, refreshed by cron and on-demand endpoints
CREATE TABLE widget_pool_snapshot (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  snapshot_json TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE widget_user_snapshots (
  btc_address TEXT PRIMARY KEY,
  snapshot_json TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Indexes
CREATE INDEX idx_subscriptions_address ON push_subscriptions(btc_address);
CREATE INDEX idx_subscriptions_active ON push_subscriptions(active);
CREATE INDEX idx_subscriptions_widget_updates ON push_subscriptions(widget_updates_enabled, last_widget_push_at);
