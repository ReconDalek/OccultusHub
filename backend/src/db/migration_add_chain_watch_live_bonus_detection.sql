-- Lets the live Chain Watch poll auto-detect bonus hits (Massacre/Genocide/
-- Wishful Thinking thresholds) as they land, instead of waiting for the
-- chain to end and its chainreport to become available.
-- last_bonus_check_at throttles the extra /faction/attacks lookup to
-- roughly once per ~8s regardless of how many people are polling at once.
ALTER TABLE chain_watch_sessions ADD COLUMN last_bonus_check_at INTEGER;

-- Per-session log of live-detected bonus hits — doubles as the "already
-- checked this position" dedup set and as the source for the short-lived
-- "just landed" notice shown to every viewer polling shortly after.
CREATE TABLE IF NOT EXISTS chain_watch_bonus_detections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  chain_position INTEGER NOT NULL,
  torn_user_id INTEGER NOT NULL,
  merit_type TEXT NOT NULL,
  detected_at INTEGER NOT NULL,
  UNIQUE(session_id, chain_position)
);
CREATE INDEX IF NOT EXISTS idx_chain_watch_bonus_detections_session ON chain_watch_bonus_detections(session_id);
