-- One report per (message, reporter): unlimited re-reports were unbounded D1
-- writes and let a single user flood the admin queue. addReport now uses
-- INSERT OR IGNORE against this index, so repeat reports are no-ops.
--
-- Dedupe existing rows first (keep the earliest) so the unique index can build.

DELETE FROM chat_reports
WHERE rowid NOT IN (
  SELECT MIN(rowid) FROM chat_reports GROUP BY message_id, reporter
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_reports_unique
  ON chat_reports(message_id, reporter);
