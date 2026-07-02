-- Chat nickname hardening: global uniqueness + admin-assigned "official" handles.
--
-- `norm` is the app-computed canonical key (nicknameKey(): fold confusables +
-- leetspeak, strip non-alpha) so "satoshi"/"sat0shi"/Cyrillic look-alikes
-- collapse to one value; the partial unique index makes cloning another
-- member's name impossible (app also checks it for a friendly 409). `official`
-- marks admin-assigned/locked handles that users cannot take or overwrite.
--
-- Legacy rows keep norm = NULL (excluded from the unique index) until they are
-- next written via setNickname, which recomputes norm. The table is tiny at
-- launch, so no bulk backfill is required.

ALTER TABLE chat_profiles ADD COLUMN norm TEXT;
ALTER TABLE chat_profiles ADD COLUMN official INTEGER DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_profiles_norm
  ON chat_profiles(norm) WHERE norm IS NOT NULL;
