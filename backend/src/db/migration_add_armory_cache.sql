-- Armory cache: one JSON blob per faction, refreshed every 6 hours
CREATE TABLE IF NOT EXISTS armory_cache (
  faction_id  INTEGER PRIMARY KEY,
  data        TEXT NOT NULL,
  fetched_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
