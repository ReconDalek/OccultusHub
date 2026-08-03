-- Stat-gain leaderboards (Leadership > Scheduling > Leaderboards). One config
-- row per type; the leaderboard itself is computed live from
-- personal_stats_snapshots, not stored — this table only holds what each
-- leaderboard is currently tracking.
CREATE TABLE IF NOT EXISTS leaderboard_config (
  type       TEXT PRIMARY KEY,   -- 'faction' | 'social' | 'event'
  stat_key   TEXT,               -- matches PERSONAL_STAT_FIELDS[].key; NULL = not configured yet
  year       INTEGER,
  month      INTEGER,            -- 1-12
  updated_by INTEGER,
  updated_at DATETIME
);
INSERT OR IGNORE INTO leaderboard_config (type) VALUES ('faction'), ('social'), ('event');
