-- OC Rotation Scheduler: per-crime testing-phase toggle + threshold, and a
-- log of every "join this slot next" suggestion so accuracy/turnover can be
-- measured against what members actually did.
CREATE TABLE IF NOT EXISTS oc_rotation_config (
  crime_name     TEXT PRIMARY KEY,
  difficulty     INTEGER,
  enabled        INTEGER NOT NULL DEFAULT 0,
  min_pass_rate  INTEGER NOT NULL DEFAULT 70,
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_by     INTEGER
);

-- One row per suggestion made for a specific vacant slot. Not unique on
-- (crime_id, position_id) — a slot can be re-suggested after an earlier
-- suggestion resolves to something other than a match (e.g. filled by
-- someone else), and we keep the history rather than overwrite it.
CREATE TABLE IF NOT EXISTS oc_rotation_suggestions (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  faction_id           INTEGER NOT NULL,
  crime_id             INTEGER NOT NULL,
  crime_name           TEXT NOT NULL,
  position             TEXT NOT NULL,
  position_id          TEXT NOT NULL,
  position_label       TEXT,
  torn_user_id         INTEGER NOT NULL,   -- suggested member
  pass_rate_used       INTEGER,            -- NULL for a trial pick (no direct CPR yet)
  threshold_used       INTEGER,
  is_trial_pick        INTEGER NOT NULL DEFAULT 0,
  suggested_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
  -- pending | joined_match | joined_wrong_member | joined_wrong_position |
  -- slot_filled_elsewhere | expired_unfilled | superseded
  status               TEXT NOT NULL DEFAULT 'pending',
  actual_torn_user_id  INTEGER,
  resolved_at          DATETIME
);
CREATE INDEX IF NOT EXISTS idx_oc_rotation_suggestions_slot    ON oc_rotation_suggestions(crime_id, position_id);
CREATE INDEX IF NOT EXISTS idx_oc_rotation_suggestions_status  ON oc_rotation_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_oc_rotation_suggestions_faction ON oc_rotation_suggestions(faction_id, suggested_at DESC);
CREATE INDEX IF NOT EXISTS idx_oc_rotation_suggestions_member  ON oc_rotation_suggestions(torn_user_id);

-- Small key/value store for scheduler bookkeeping (e.g. last poll time), so
-- the 10-minute cron can throttle itself to the real 30-60 min cadence
-- without a dedicated cron trigger entry.
CREATE TABLE IF NOT EXISTS oc_rotation_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
