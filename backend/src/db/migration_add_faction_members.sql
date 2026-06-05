-- Permanent record of every faction member across all 3 factions, past and present.
-- torn_user_id is the Torn player ID — globally unique and never changes.
-- Synced automatically every 12 hours from faction_cache data (no extra API calls).

CREATE TABLE IF NOT EXISTS faction_members (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  torn_user_id     INTEGER NOT NULL UNIQUE,
  username         TEXT    NOT NULL,
  faction_id       INTEGER NOT NULL,
  faction_position TEXT,
  level            INTEGER,
  days_in_faction  INTEGER,
  status           TEXT,        -- 'Okay' | 'Hospital' | 'Jail' | 'Traveling' | 'Abroad' | 'Federal'
  last_seen_at     INTEGER,     -- Unix epoch seconds from last_action.timestamp
  is_active        INTEGER NOT NULL DEFAULT 1,  -- 1 = currently in one of our factions
  joined_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  left_at          DATETIME,                    -- most recent departure (nullable)
  last_updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_faction_members_faction_id   ON faction_members(faction_id);
CREATE INDEX IF NOT EXISTS idx_faction_members_is_active    ON faction_members(is_active);
CREATE INDEX IF NOT EXISTS idx_faction_members_torn_user_id ON faction_members(torn_user_id);
