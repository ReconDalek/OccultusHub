-- Per-chain bonus-hit log (the Nth hit in a chain, at Torn's bonus-respect
-- milestones) — the actual data Massacre/Genocide/Wishful Thinking merit
-- eligibility is derived from. Populated automatically whenever a chain's
-- hits are saved (see chainController.js saveChainHits/saveChainImport).
CREATE TABLE IF NOT EXISTS chain_bonus_hits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  torn_chain_id INTEGER NOT NULL,
  faction_id INTEGER NOT NULL,
  torn_user_id INTEGER NOT NULL,
  chain_position INTEGER NOT NULL, -- e.g. 250, 500, 1000, 2500, 5000, 10000...
  respect REAL,
  saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(torn_chain_id, chain_position)
);
CREATE INDEX IF NOT EXISTS idx_chain_bonus_hits_user ON chain_bonus_hits(torn_user_id);
