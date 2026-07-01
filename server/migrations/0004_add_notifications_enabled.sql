-- Per-device master "Enable Notifications" flag.
--
-- The app's master toggle is per-device, but category prefs
-- (notification_preferences) are per-address and shared across a user's
-- devices. Without a per-token flag, disabling notifications on one device only
-- changed local state — the cron kept sending block/worker/best-diff pushes
-- because the subscription stayed active (widget refresh keeps it active) and
-- the shared category prefs stayed = 1. This column lets the cron skip visible
-- pushes per token without clobbering another device's category choices.
--
-- Default 1: existing devices keep current behavior until their client next
-- syncs (a master-off client flips this to 0 on its next register/preferences
-- call), so no one loses notifications they currently receive.
ALTER TABLE push_subscriptions
  ADD COLUMN notifications_enabled INTEGER DEFAULT 1;
