-- Merit Tracker's candidate pool (chain+war hits, activity, energy, OC
-- inactivity, warnings) is expensive to compute and doesn't need to be
-- fresh more than hourly — cached per faction instead of recomputed on
-- every page load/poll from every viewer.
CREATE TABLE IF NOT EXISTS merit_pool_cache (
  faction_id INTEGER PRIMARY KEY,
  pool_json TEXT NOT NULL,
  simple_pool_json TEXT NOT NULL,
  computed_at INTEGER NOT NULL
);
