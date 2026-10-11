-- Chain watcher shift sign-ups — one row per claimed hour slot per faction.
-- An hour with no row is open. slot_start is the UTC unix timestamp (seconds)
-- of the top of the hour.
CREATE TABLE IF NOT EXISTS chain_watch_shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  faction_id INTEGER NOT NULL,
  slot_start INTEGER NOT NULL,
  torn_user_id INTEGER NOT NULL,
  signed_up_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(faction_id, slot_start)
);
