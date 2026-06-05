-- Stores per-member hit contributions for each tracked chain.
-- UNIQUE(torn_chain_id, torn_user_id) — one row per member per chain.
-- Re-saving (upsert) is safe and idempotent.

CREATE TABLE IF NOT EXISTS chain_hits (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  torn_chain_id INTEGER NOT NULL,
  faction_id    INTEGER NOT NULL,
  torn_user_id  INTEGER NOT NULL,
  total_attacks INTEGER NOT NULL DEFAULT 0,
  total_respect REAL    NOT NULL DEFAULT 0,
  bonus_hits    INTEGER NOT NULL DEFAULT 0,
  start_at      INTEGER NOT NULL,   -- Unix epoch seconds (from Torn API)
  saved_by      INTEGER,            -- FK → users.id
  saved_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(torn_chain_id, torn_user_id),
  FOREIGN KEY(saved_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_chain_hits_torn_chain_id ON chain_hits(torn_chain_id);
CREATE INDEX IF NOT EXISTS idx_chain_hits_torn_user_id  ON chain_hits(torn_user_id);
