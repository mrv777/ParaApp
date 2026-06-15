-- Migration: add iOS-widget schema to an existing database.
-- Apply against the remote D1 BEFORE deploying the widget-enabled worker:
--   npx wrangler d1 execute paraapp-notifications-db --remote --file=migrations/0001_add_widget_schema.sql
--
-- This is the incremental delta for databases created from the pre-widget
-- schema.sql. Fresh databases get everything from schema.sql directly.
--
-- NOTE: SQLite/D1 `ALTER TABLE ... ADD COLUMN` does not support `IF NOT EXISTS`.
-- If these columns already exist, the two ALTER statements error with
-- "duplicate column name" — check `PRAGMA table_info(push_subscriptions);`
-- first and remove any line for a column that is already present.

ALTER TABLE push_subscriptions ADD COLUMN widget_updates_enabled INTEGER DEFAULT 0;
ALTER TABLE push_subscriptions ADD COLUMN last_widget_push_at INTEGER;

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

CREATE INDEX IF NOT EXISTS idx_subscriptions_widget_updates
  ON push_subscriptions(widget_updates_enabled, last_widget_push_at);
