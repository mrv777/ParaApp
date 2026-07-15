-- Chat address badges: admin-assigned cosmetic flair (e.g. bozo 🤡), independent
-- of the nickname and of `official`. Stored as a JSON array of badge keys (see
-- src/chat/badges.ts); NULL = no badges. Unlike `official`, badges never lock or
-- alter the nickname — they are purely decorative and admin-removable, and a row
-- may carry badges with no nickname at all.
ALTER TABLE chat_profiles ADD COLUMN badges TEXT;
