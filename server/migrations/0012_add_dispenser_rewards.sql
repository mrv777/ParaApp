-- Dispenser "reward earned" notifications.
-- notify_rewards: account-wide preference (default on, matching the others).
-- dispenser_state: JSON watermark of per-tier assigned-slot counts used to
-- detect newly assigned dispenser rewards. NULL = baseline not yet observed.
-- NOTE: SQLite/D1 `ALTER TABLE ... ADD COLUMN` does not support `IF NOT EXISTS`.
ALTER TABLE notification_preferences ADD COLUMN notify_rewards INTEGER DEFAULT 1;
ALTER TABLE user_state ADD COLUMN dispenser_state TEXT;
