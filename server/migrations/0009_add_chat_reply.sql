-- Reply-to-message support: a message may reference an older message as its
-- parent. `reply_to` holds that parent's id (or NULL for a normal message).
--
-- The quote shown above a reply (sender + one-line preview) is hydrated at
-- read/broadcast time from the live parent row, so no denormalized snapshot is
-- stored here — a deleted/pruned/blocked parent simply yields no quote. No index
-- is needed: the parent is fetched by its primary key, and we never query for
-- "all replies to X".

ALTER TABLE chat_messages ADD COLUMN reply_to TEXT;
