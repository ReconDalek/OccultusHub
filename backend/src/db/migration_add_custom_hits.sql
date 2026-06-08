-- Custom / miscellaneous hit contributions (events, raids, other).
-- Multiple entries per user are allowed (one row per save event).

CREATE TABLE IF NOT EXISTS custom_hits (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  faction_id   INTEGER NOT NULL,
  torn_user_id INTEGER NOT NULL,
  username     TEXT,
  hit_type     TEXT    NOT NULL,   -- e.g. 'Event', 'Raid', 'Other'
  hits         INTEGER NOT NULL DEFAULT 0,
  notes        TEXT,
  saved_by     INTEGER,
  saved_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_custom_hits_user    ON custom_hits(torn_user_id);
CREATE INDEX IF NOT EXISTS idx_custom_hits_faction ON custom_hits(faction_id);
