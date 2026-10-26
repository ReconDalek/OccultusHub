-- Lets leadership manually mark a member as having received a ranked merit
-- (Massacre/Genocide/Wishful Thinking) on the chain currently being
-- watched — the fallback for when live detection misses a hit (e.g.
-- nobody had the page open when the threshold was actually crossed).
-- The table is new and empty in production, so it's safe to recreate
-- rather than migrate in place.
--
-- Uniqueness moves from (session_id, chain_position) to
-- (session_id, torn_user_id, merit_type): a real position can only ever
-- be landed by one attacker, but a manual mark has no specific attack to
-- key off, and the actual invariant that matters either way is "this
-- user already has this merit recorded for this chain" — not "this raw
-- number has been used."
DROP TABLE IF EXISTS chain_watch_bonus_detections;
CREATE TABLE chain_watch_bonus_detections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  chain_position INTEGER, -- NULL for a manual mark (no specific attack behind it)
  torn_user_id INTEGER NOT NULL,
  merit_type TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'live', -- 'live' | 'manual'
  detected_at INTEGER NOT NULL,
  UNIQUE(session_id, torn_user_id, merit_type)
);
CREATE INDEX IF NOT EXISTS idx_chain_watch_bonus_detections_session ON chain_watch_bonus_detections(session_id);
