-- Admin moderation tools: timed bans + an admin audit trail.
--
-- Timed bans: chat_bans.expires_at is a seconds-epoch; NULL = permanent (the
-- prior behavior). isBanned() ignores rows whose expires_at is in the past, so a
-- temp ban self-lifts; the retention cron reaps the expired rows.
ALTER TABLE chat_bans ADD COLUMN expires_at INTEGER;   -- seconds epoch; NULL = permanent

-- Speeds up the admin "all messages from address X" search and ban-purge, which
-- filter by sender (created_at tie-breaks for the newest-first page ordering).
CREATE INDEX IF NOT EXISTS idx_chat_messages_address ON chat_messages(address, created_at);

-- Admin action audit trail: one row per mutating moderation action so a shared
-- ADMIN_SECRET still leaves a reviewable history. Admin-only (secret-gated read).
CREATE TABLE IF NOT EXISTS chat_admin_audit (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,     -- delete | undelete | ban | ban+purge | unban | nickname | announce | announce-clear
  target TEXT,              -- message id or address the action applied to
  detail TEXT,              -- freeform: reason, nickname, duration, purged count
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_chat_admin_audit_created ON chat_admin_audit(created_at);
