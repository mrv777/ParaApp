-- Apply before deploying source-limited push registration. No raw IPs stored.
CREATE TABLE IF NOT EXISTS push_enrollment_limits (
  source_key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL,
  PRIMARY KEY (source_key, window_start)
);
CREATE INDEX IF NOT EXISTS idx_push_enrollment_window
  ON push_enrollment_limits(window_start);
