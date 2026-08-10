-- Per-member, per-month toggle to "excuse" someone from a Warnings > Generate
-- report without logging a formal exemption — a leader's one-off judgment call
-- (e.g. right at the target, OD count taken into consideration) rather than a
-- standing rule. Scoped to a calendar month, not a specific chain/report run,
-- so it persists across regenerating the report for that same month.
CREATE TABLE IF NOT EXISTS warning_exclusions (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  torn_user_id         INTEGER NOT NULL,
  username             TEXT,
  warning_type         TEXT NOT NULL CHECK (warning_type IN ('Energy', 'Chain')),
  year                 INTEGER NOT NULL,
  month                INTEGER NOT NULL,
  created_by           INTEGER,
  created_by_username  TEXT,
  created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(torn_user_id, warning_type, year, month)
);

CREATE INDEX IF NOT EXISTS idx_warning_exclusions_lookup
  ON warning_exclusions(warning_type, year, month);
