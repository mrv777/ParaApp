-- Composite index for by-address active-subscription lookups.
--
-- Queries like `WHERE btc_address = ? AND active = 1` previously mis-planned
-- onto the single-column, low-cardinality `idx_subscriptions_active` (active
-- has only two values), which re-scanned every active row. A composite index
-- led by btc_address lets SQLite satisfy both equality terms directly, reading
-- only the matching rows. Defense-in-depth alongside the cron's grouped scan.
CREATE INDEX IF NOT EXISTS idx_subscriptions_addr_active
  ON push_subscriptions(btc_address, active);

-- The old single-column btc_address index is now redundant: the composite index
-- above satisfies plain `WHERE btc_address = ?` via its leading column. Drop it
-- to avoid maintaining two overlapping indexes on writes.
DROP INDEX IF EXISTS idx_subscriptions_address;
