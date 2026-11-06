-- English-only translations are optional and never replace the original message.
CREATE TABLE IF NOT EXISTS chat_translations (
  message_id TEXT PRIMARY KEY NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'english', 'translated', 'failed', 'skipped')),
  source_language TEXT,
  text TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Reservations are charged before provider calls, including failed/time-out calls.
CREATE TABLE IF NOT EXISTS chat_translation_usage (
  month TEXT PRIMARY KEY NOT NULL,
  translation_attempts INTEGER NOT NULL DEFAULT 0 CHECK (translation_attempts BETWEEN 0 AND 500),
  detection_characters INTEGER NOT NULL DEFAULT 0 CHECK (detection_characters BETWEEN 0 AND 250000),
  translation_characters INTEGER NOT NULL DEFAULT 0 CHECK (translation_characters BETWEEN 0 AND 250000)
);
