-- Faction activity tracker: 30-minute activity sampling for our own factions
-- plus any faction leadership chooses to track (bulk-added, or auto-added as
-- a ranked-war opponent when matched). See factionActivityController.js.

-- Which factions get sampled. source: 'own' (our 3, never removable),
-- 'manual' (added by leadership), 'war' (auto-added on a war match — removed
-- automatically once expires_at passes, unless re-added manually).
CREATE TABLE IF NOT EXISTS activity_factions (
  faction_id       INTEGER PRIMARY KEY,
  name             TEXT,
  tag              TEXT,
  members          INTEGER,
  source           TEXT    NOT NULL DEFAULT 'manual',
  is_active        INTEGER NOT NULL DEFAULT 1,
  added_by         INTEGER,
  added_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at       INTEGER,          -- unix seconds; war-sourced auto-removal
  last_sampled_at  INTEGER,          -- unix seconds of the last successful sample
  last_slot        INTEGER,          -- floor(unix / 1800) of the last sample attempt
  last_error       TEXT,
  error_count      INTEGER NOT NULL DEFAULT 0
);

-- One row per faction per UTC (TCT) day. data is JSON:
--   { "<torn_user_id>": ["<name>", "<48 chars>"], ... }
-- one char per 30-minute slot of that day:
--   '.' not sampled (not tracked yet / not in the faction / sample failed)
--   '0' offline   '1' idle (session open, no action in the slot)
--   '2' active (took an action in the slot)
-- '.' slots are excluded from every percentage, so gaps never read as offline.
CREATE TABLE IF NOT EXISTS activity_days (
  faction_id  INTEGER NOT NULL,
  day         TEXT    NOT NULL,      -- YYYY-MM-DD (UTC = Torn City Time)
  data        TEXT    NOT NULL,
  updated_at  INTEGER,
  PRIMARY KEY (faction_id, day)
);

CREATE INDEX IF NOT EXISTS idx_activity_days_day ON activity_days(day);

INSERT OR IGNORE INTO activity_factions (faction_id, name, source) VALUES
  (33097, 'Occultus', 'own'),
  (9728,  'Occul2us', 'own'),
  (9171,  'Occul3us', 'own');

-- Opponents of wars already matched/active when this shipped (future matches
-- are added by checkWarMatches → trackWarOpponent). Expire 14 days after start.
INSERT OR IGNORE INTO activity_factions (faction_id, name, source, expires_at)
SELECT opponent_faction_id, opponent_faction_name, 'war', COALESCE(started_at, scheduled_start) + 14 * 86400
FROM ranked_wars
WHERE status IN ('matched', 'active') AND opponent_faction_id IS NOT NULL
GROUP BY opponent_faction_id;
