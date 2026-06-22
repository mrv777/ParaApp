-- Migration: add the cron single-flight guard table to an existing database.
-- Apply against the remote D1 BEFORE deploying the worker that uses it:
--   npx wrangler d1 execute paraapp-notifications-db --remote --file=migrations/0002_add_cron_runs.sql
--
-- Deploying the worker before this runs is safe: claimCronTick() fails open on a
-- missing table, so the cron keeps working (just without same-tick de-dup) until
-- the table exists. Fresh databases get this from schema.sql directly.
--
-- One row per processed cron tick (scheduledTime in ms). A duplicate dispatch of
-- the same tick collides on the primary key, so only the first run proceeds.

CREATE TABLE IF NOT EXISTS cron_runs (
  scheduled_time INTEGER PRIMARY KEY,
  created_at INTEGER DEFAULT (unixepoch())
);
