-- Organized Crime tracking: complete history of faction crimes + per-slot
-- detail, plus a rolling best-known checkpoint pass rate per member/position
-- used for team-building suggestions.
CREATE TABLE IF NOT EXISTS oc_crimes (
  id                INTEGER PRIMARY KEY,   -- Torn's own crime id
  faction_id        INTEGER NOT NULL,
  previous_crime_id INTEGER,
  name              TEXT NOT NULL,
  difficulty        INTEGER,
  status            TEXT NOT NULL,         -- Recruiting | Planning | Successful | Failure | Expired
  created_at        INTEGER,
  planning_at       INTEGER,
  executed_at       INTEGER,
  ready_at          INTEGER,
  expired_at        INTEGER,
  rewards_json      TEXT,
  fetched_at        DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_oc_crimes_faction_status  ON oc_crimes(faction_id, status);
CREATE INDEX IF NOT EXISTS idx_oc_crimes_faction_created ON oc_crimes(faction_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oc_crimes_name             ON oc_crimes(name);

CREATE TABLE IF NOT EXISTS oc_crime_slots (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  crime_id              INTEGER NOT NULL,
  position              TEXT NOT NULL,     -- e.g. "Muscle" (position type, no numbering)
  position_id           TEXT,              -- e.g. "P5" (Torn's slot id within the crime)
  position_label        TEXT,              -- e.g. "Muscle #1"
  position_number       INTEGER,
  item_id               INTEGER,
  item_reusable         INTEGER,
  item_available        INTEGER,
  torn_user_id          INTEGER,
  joined_at             INTEGER,
  progress              REAL,
  outcome               TEXT,              -- Successful | Failed | Hospitalized | Jailed | Injured | NULL
  outcome_duration       INTEGER,
  checkpoint_pass_rate  INTEGER,
  UNIQUE(crime_id, position_id)
);
CREATE INDEX IF NOT EXISTS idx_oc_crime_slots_crime ON oc_crime_slots(crime_id);
CREATE INDEX IF NOT EXISTS idx_oc_crime_slots_user  ON oc_crime_slots(torn_user_id);

-- Rolling best-known CPR per member/crime-name/position, used to suggest
-- teams with the highest combined pass rate. Never decreases automatically —
-- only updates when a freshly-observed rate is higher than what's stored.
CREATE TABLE IF NOT EXISTS oc_member_cpr (
  torn_user_id      INTEGER NOT NULL,
  crime_name        TEXT NOT NULL,
  position          TEXT NOT NULL,
  best_pass_rate    INTEGER NOT NULL,
  last_seen_at      INTEGER,
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (torn_user_id, crime_name, position)
);
