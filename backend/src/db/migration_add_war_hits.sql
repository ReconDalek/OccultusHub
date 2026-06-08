-- Permanent per-member war contribution records (parallel to chain_hits).
-- Populated when a leader saves a completed war payout.
-- UNIQUE(ranked_war_id, torn_user_id) — one row per member per war.

CREATE TABLE IF NOT EXISTS war_hits (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ranked_war_id  INTEGER NOT NULL,
  faction_id     INTEGER NOT NULL,
  torn_user_id   INTEGER NOT NULL,
  username       TEXT,
  war_hits       INTEGER DEFAULT 0,
  outside_hits   INTEGER DEFAULT 0,
  assists        INTEGER DEFAULT 0,
  respect_gained REAL    DEFAULT 0,
  payout_amount  INTEGER DEFAULT 0,
  units          REAL    DEFAULT 0,
  saved_by       INTEGER,
  saved_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(ranked_war_id, torn_user_id)
);

CREATE INDEX IF NOT EXISTS idx_war_hits_war     ON war_hits(ranked_war_id);
CREATE INDEX IF NOT EXISTS idx_war_hits_user    ON war_hits(torn_user_id);
CREATE INDEX IF NOT EXISTS idx_war_hits_faction ON war_hits(faction_id);

-- Track whether permanent war_hits have been written for this war (prevents re-save)
ALTER TABLE ranked_wars ADD COLUMN hits_saved INTEGER DEFAULT 0;

-- Manual entries created through the UI rather than API auto-detection
ALTER TABLE ranked_wars ADD COLUMN is_manual  INTEGER DEFAULT 0;
