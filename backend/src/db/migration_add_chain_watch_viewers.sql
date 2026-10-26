-- Tracks who's actively polling the live chain timer, so "currently
-- watching" and all-time peak concurrency can be shown. One row per
-- (user, faction) pair, upserted on every poll — bounded in size by
-- distinct viewers ever seen, not by poll count.
CREATE TABLE IF NOT EXISTS chain_watch_viewers (
  torn_user_id INTEGER NOT NULL,
  faction_id INTEGER NOT NULL,
  last_polled_at INTEGER NOT NULL, -- unix seconds
  PRIMARY KEY (torn_user_id, faction_id)
);

-- Highest concurrent-viewer count ever observed. faction_id = 0 is the
-- combined/overall peak across all factions at once; other rows are
-- per-faction peaks.
CREATE TABLE IF NOT EXISTS chain_watch_viewer_peaks (
  faction_id INTEGER PRIMARY KEY,
  peak_count INTEGER NOT NULL,
  peak_at DATETIME
);
