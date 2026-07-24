-- Per-slot importance weight for each crime (e.g. Break the Bank's "Muscle #1"
-- vs "Muscle #2" vs "Muscle #3" each have a different real weight in Torn's
-- success formula). Auto-seeded when a new crime/slot is first detected and
-- auto-refreshed from observed history until leadership manually overrides a
-- row (auto_computed flips to 0 and the cron stops touching it).
CREATE TABLE IF NOT EXISTS oc_position_weights (
  crime_name      TEXT NOT NULL,
  position        TEXT NOT NULL,          -- e.g. "Muscle"
  position_number INTEGER NOT NULL,       -- e.g. 1, 2, 3
  position_label  TEXT,                   -- e.g. "Muscle #1"
  weight          REAL NOT NULL DEFAULT 0,
  auto_computed   INTEGER NOT NULL DEFAULT 1,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_by      INTEGER,
  PRIMARY KEY (crime_name, position, position_number)
);
