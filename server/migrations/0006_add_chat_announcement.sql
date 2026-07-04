-- Single admin-authored announcement banner (one slot). Shown at the top of chat
-- for everyone. Admin-only via ADMIN_SECRET; body NULL = no announcement.
CREATE TABLE IF NOT EXISTS chat_announcement (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  body TEXT,
  updated_at INTEGER DEFAULT (unixepoch())
);
INSERT OR IGNORE INTO chat_announcement (id, body) VALUES (1, NULL);
