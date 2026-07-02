-- Community chat schema (all tables created up front so later phases —
-- reactions, profiles, blocks, reports, bans, EULA — need no further migration).
--
-- Time units: chat_messages.created_at is MILLISECONDS (Date.now()) to match the
-- WS `ts` field and give sub-second history ordering. All other *_at columns
-- here use unixepoch() seconds like the rest of the schema.

-- Messages (durable history; DO broadcasts live, D1 is the queryable store)
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,          -- ms epoch
  deleted INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);

-- Fixed-set emoji reactions (Phase 3). One row per (message, address, emoji).
CREATE TABLE IF NOT EXISTS chat_reactions (
  message_id TEXT NOT NULL,
  address TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (message_id, address, emoji)
);
CREATE INDEX IF NOT EXISTS idx_chat_reactions_message ON chat_reactions(message_id);

-- Optional moderated nickname (Phase 4). Falls back to truncated address.
CREATE TABLE IF NOT EXISTS chat_profiles (
  address TEXT PRIMARY KEY,
  nickname TEXT,
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Per-user block list (Phase 5). Server-enforced outbound filtering.
CREATE TABLE IF NOT EXISTS chat_blocks (
  blocker TEXT NOT NULL,
  blocked TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (blocker, blocked)
);

-- Report queue (Phase 5). Admin triages via the web admin page.
CREATE TABLE IF NOT EXISTS chat_reports (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  reporter TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  resolved INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_chat_reports_resolved ON chat_reports(resolved, created_at);

-- Banned addresses (Phase 1 gate + Phase 5 admin). Rejected at session + post time.
CREATE TABLE IF NOT EXISTS chat_bans (
  address TEXT PRIMARY KEY,
  reason TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

-- One-time EULA / community-guidelines acceptance before first post (Phase 5).
CREATE TABLE IF NOT EXISTS chat_eula_accept (
  address TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  accepted_at INTEGER DEFAULT (unixepoch())
);
