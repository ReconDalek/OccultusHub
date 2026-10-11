-- A leader-declared chain watch window per faction. The live Torn chain
-- endpoint is only polled while a session is 'scheduled' (future) or
-- 'active' — we may only run a chain once a month, so there's no reason to
-- hit Torn's API continuously the rest of the time.
CREATE TABLE IF NOT EXISTS chain_watch_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  faction_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled', -- 'scheduled' | 'active' | 'ended'
  scheduled_start INTEGER,                  -- unix seconds; NULL = started immediately
  started_at INTEGER,
  ended_at INTEGER,
  created_by INTEGER NOT NULL,              -- torn_user_id of the leader who scheduled it
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_chain_watch_sessions_faction_status ON chain_watch_sessions(faction_id, status);
