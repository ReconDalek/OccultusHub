-- Tracks whether a chain is currently active per faction (one row per faction)
CREATE TABLE IF NOT EXISTS active_chain_sessions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  faction_id       INTEGER NOT NULL UNIQUE,
  chain_start_at   INTEGER NOT NULL,           -- Unix epoch when chain began
  current_length   INTEGER NOT NULL DEFAULT 0, -- hit count at last check
  timeout          INTEGER NOT NULL DEFAULT 0, -- seconds until timeout at last check
  modifier         REAL    NOT NULL DEFAULT 1.0,
  status           TEXT    NOT NULL DEFAULT 'active', -- 'active' | 'ended'
  ended_at         INTEGER,                    -- Unix epoch when chain ended/timed out
  last_attack_id   INTEGER NOT NULL DEFAULT 0, -- highest torn attack ID fetched so far
  last_checked_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Per-member rolling hit counts during an active chain (upserted each cron run)
CREATE TABLE IF NOT EXISTS chain_session_stats (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  faction_id     INTEGER NOT NULL,
  chain_start_at INTEGER NOT NULL,
  torn_user_id   INTEGER NOT NULL,
  username       TEXT,
  total_attacks  INTEGER NOT NULL DEFAULT 0,
  total_respect  REAL    NOT NULL DEFAULT 0.0,
  bonus_hits     INTEGER NOT NULL DEFAULT 0,
  UNIQUE(faction_id, chain_start_at, torn_user_id)
);

CREATE INDEX IF NOT EXISTS idx_chain_session_stats_faction
  ON chain_session_stats(faction_id, chain_start_at);

-- Armory usage during an active chain (deduped by Torn news item ID)
CREATE TABLE IF NOT EXISTS chain_session_armory (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  faction_id     INTEGER NOT NULL,
  chain_start_at INTEGER NOT NULL,
  torn_news_id   TEXT    NOT NULL UNIQUE,
  torn_user_id   INTEGER,
  username       TEXT,
  item_name      TEXT,
  used_at        INTEGER
);

CREATE INDEX IF NOT EXISTS idx_chain_session_armory_faction
  ON chain_session_armory(faction_id, chain_start_at);
