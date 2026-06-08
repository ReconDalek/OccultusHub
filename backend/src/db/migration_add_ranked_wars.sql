-- Ranked war tracking tables

CREATE TABLE IF NOT EXISTS ranked_wars (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  faction_id            INTEGER NOT NULL,
  opponent_faction_id   INTEGER NOT NULL,
  opponent_faction_name TEXT,
  torn_war_id           INTEGER,
  status                TEXT    NOT NULL DEFAULT 'matched',  -- 'matched'|'active'|'completed'
  scheduled_start       INTEGER,    -- Unix epoch from news "will begin..." text
  started_at            INTEGER,    -- when war became active
  ended_at              INTEGER,    -- when war ended
  result                TEXT,       -- 'won'|'lost'
  rank_change           TEXT,       -- e.g. "Ranked down from Diamond to Platinum III"
  bonus_respect         INTEGER,
  last_attack_fetched   INTEGER DEFAULT 0,  -- high watermark: latest attack.started we've stored
  last_checked_at       DATETIME,
  created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(faction_id, opponent_faction_id, scheduled_start)
);

CREATE INDEX IF NOT EXISTS idx_ranked_wars_faction ON ranked_wars(faction_id);
CREATE INDEX IF NOT EXISTS idx_ranked_wars_status  ON ranked_wars(status);

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS war_attacks (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ranked_war_id  INTEGER NOT NULL,
  faction_id     INTEGER NOT NULL,
  torn_attack_id INTEGER NOT NULL UNIQUE,
  attacker_id    INTEGER NOT NULL,
  attacker_name  TEXT,
  defender_id    INTEGER NOT NULL,
  defender_name  TEXT,
  -- 'war_attack'|'war_defend'|'outside_attack'|'outside_defend'
  attack_type    TEXT    NOT NULL,
  result         TEXT,
  respect_gain   REAL    DEFAULT 0,
  respect_loss   REAL    DEFAULT 0,
  is_interrupted INTEGER DEFAULT 0,
  fair_fight     REAL    DEFAULT 1,
  started_at     INTEGER NOT NULL,
  FOREIGN KEY(ranked_war_id) REFERENCES ranked_wars(id)
);

CREATE INDEX IF NOT EXISTS idx_war_attacks_war      ON war_attacks(ranked_war_id);
CREATE INDEX IF NOT EXISTS idx_war_attacks_attacker ON war_attacks(ranked_war_id, attacker_id);

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS war_armory_usage (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ranked_war_id INTEGER NOT NULL,
  faction_id    INTEGER NOT NULL,
  torn_news_id  TEXT    NOT NULL UNIQUE,  -- Torn news entry ID (deduplication)
  torn_user_id  INTEGER,
  username      TEXT,
  item_name     TEXT    NOT NULL,
  used_at       INTEGER NOT NULL,
  FOREIGN KEY(ranked_war_id) REFERENCES ranked_wars(id)
);

CREATE INDEX IF NOT EXISTS idx_war_armory_war  ON war_armory_usage(ranked_war_id);
CREATE INDEX IF NOT EXISTS idx_war_armory_user ON war_armory_usage(ranked_war_id, torn_user_id);
