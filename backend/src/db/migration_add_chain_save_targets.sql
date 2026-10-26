-- "Quick Target" — mirrors OccultusBot's findChainUser: a small shared pool
-- of arranged chain-saving accounts (not regular faction members) any
-- member can check for availability when a chain is about to drop. Shared
-- across all three factions, same as the bot's own hardcoded list — not
-- faction-scoped. Seeded with that exact list so nothing is lost moving
-- management over to the website.
CREATE TABLE IF NOT EXISTS chain_save_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  torn_user_id INTEGER NOT NULL UNIQUE,
  username TEXT,
  added_by INTEGER,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO chain_save_targets (torn_user_id) VALUES
  (1881031), (2732583), (2450926), (2654871), (1656002),
  (1862874), (2741968), (1784245), (2821320), (2267378), (1988975);
