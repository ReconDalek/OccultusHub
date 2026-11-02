-- Caches each member's computed Halloween Wrapped "title" (their best
-- family-wide category, by percentile within that category's own
-- participant pool) so a profile card can show it without recomputing the
-- whole family's stats on every view. Refreshed as a side effect whenever
-- anyone loads the Halloween Wrapped page — not on its own schedule, since
-- this is a one-off seasonal feature, not a permanent cron.
CREATE TABLE IF NOT EXISTS halloween_titles (
  torn_user_id INTEGER PRIMARY KEY,
  title_key    TEXT NOT NULL,
  title_name   TEXT NOT NULL,
  title_icon   TEXT NOT NULL,
  metric_label TEXT NOT NULL,
  value        REAL NOT NULL,
  rank         INTEGER NOT NULL,
  pool_size    INTEGER NOT NULL,
  others_with_title INTEGER NOT NULL DEFAULT 0,
  computed_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
