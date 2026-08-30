-- Move notification categories from address-wide state to each push token.
-- The legacy table is deliberately retained for rollback compatibility.
ALTER TABLE push_subscriptions ADD COLUMN notify_blocks INTEGER NOT NULL DEFAULT 1;
ALTER TABLE push_subscriptions ADD COLUMN notify_workers INTEGER NOT NULL DEFAULT 1;
ALTER TABLE push_subscriptions ADD COLUMN notify_best_diff INTEGER NOT NULL DEFAULT 1;
ALTER TABLE push_subscriptions ADD COLUMN notify_rewards INTEGER NOT NULL DEFAULT 1;

-- Preserve every existing device's effective settings at cutover. Missing or
-- legacy NULL fields remain enabled, matching the application's defaults.
UPDATE push_subscriptions
SET
  notify_blocks = COALESCE(
    (SELECT notify_blocks FROM notification_preferences
     WHERE notification_preferences.btc_address = push_subscriptions.btc_address),
    1
  ),
  notify_workers = COALESCE(
    (SELECT notify_workers FROM notification_preferences
     WHERE notification_preferences.btc_address = push_subscriptions.btc_address),
    1
  ),
  notify_best_diff = COALESCE(
    (SELECT notify_best_diff FROM notification_preferences
     WHERE notification_preferences.btc_address = push_subscriptions.btc_address),
    1
  ),
  notify_rewards = COALESCE(
    (SELECT notify_rewards FROM notification_preferences
     WHERE notification_preferences.btc_address = push_subscriptions.btc_address),
    1
  );
