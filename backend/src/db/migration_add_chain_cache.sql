-- Chain cache: stores chain history per faction, populated from Torn API v2
-- Each chain has a globally-unique ID (torn_chain_id), so UNIQUE constraint is on that alone.
-- Only new chains are inserted (INSERT OR IGNORE); existing rows are never overwritten.

CREATE TABLE IF NOT EXISTS chain_cache (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  torn_chain_id INTEGER NOT NULL UNIQUE,
  faction_id    INTEGER NOT NULL,
  chain_length  INTEGER NOT NULL,
  respect       REAL    NOT NULL,
  start_at      INTEGER NOT NULL,   -- Unix epoch seconds (from Torn API)
  end_at        INTEGER NOT NULL,   -- Unix epoch seconds (from Torn API)
  fetched_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chain_cache_faction_id ON chain_cache(faction_id);
CREATE INDEX IF NOT EXISTS idx_chain_cache_start_at   ON chain_cache(faction_id, start_at DESC);
