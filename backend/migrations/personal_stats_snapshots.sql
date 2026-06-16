CREATE TABLE IF NOT EXISTS personal_stats_snapshots (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  torn_user_id INTEGER NOT NULL,
  username     TEXT,
  faction_id   INTEGER,
  snapshot_date TEXT NOT NULL,  -- YYYY-MM-DD UTC
  stats        TEXT NOT NULL,   -- full personalstats JSON blob
  created_at   INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pss_user_date   ON personal_stats_snapshots(torn_user_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_pss_date              ON personal_stats_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_pss_faction           ON personal_stats_snapshots(faction_id);
