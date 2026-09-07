-- Per-badge admin overrides for the Achievements system (see
-- backend/src/services/achievements.js for the hardcoded defaults this
-- overrides). A row existing here always wins; a badge with no row falls
-- back to its coded default (enabled, default thresholds) — so this table
-- only needs to store what an admin has actually changed, but we seed every
-- known key up front for a predictable admin UI (nothing to "add" later).
CREATE TABLE IF NOT EXISTS achievement_configs (
  key               TEXT PRIMARY KEY,
  enabled           INTEGER NOT NULL DEFAULT 1,
  bronze_threshold  REAL,   -- NULL for binary badges (not applicable)
  silver_threshold  REAL,
  gold_threshold    REAL,
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_by        INTEGER
);

INSERT OR IGNORE INTO achievement_configs (key, enabled, bronze_threshold, silver_threshold, gold_threshold) VALUES
  ('veteran',        1, 100,  365,  1000),
  ('war_hero',       1, 5,    25,   50),
  ('chain_breaker',  1, 5,    25,   50),
  ('respect_earner', 1, 1000, 10000,50000),
  ('crime_boss',     1, 10,   50,   200),
  ('angler',         1, 10,   50,   200),
  ('rune_master',    1, 10,   50,   200),
  ('familiar_bond',  1, 10,   25,   50),
  ('card_shark',     1, 5,    20,   50),
  ('ritualist',      1, 5,    20,   50),
  ('forum_voice',    1, 1,    10,   25),
  ('cipher_sage',    1, 5,    25,   100),
  ('sanctum_adept',  1, NULL, NULL, NULL),
  ('mentor',         1, NULL, NULL, NULL),
  ('discord_linked', 1, NULL, NULL, NULL);
