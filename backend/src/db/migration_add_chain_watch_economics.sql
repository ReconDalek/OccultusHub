-- Live chain economics tracker (Attacks / Energy Out / Energy In (faction +
-- personal, with a combined total) / ODs) — mirrors the per-member Energy
-- columns War Tracking already has, but live during an in-progress chain
-- instead of only after it's saved.
--
-- bonus_watermark_attack_id (added earlier today for live bonus-hit
-- detection) is renamed since the same watermark now drives the general
-- attack sync too, not just bonus-hit checking — one scan of the attack
-- log now serves both purposes instead of two separate passes.
ALTER TABLE chain_watch_sessions RENAME COLUMN bonus_watermark_attack_id TO attack_sync_watermark;
ALTER TABLE chain_watch_sessions ADD COLUMN armory_sync_watermark INTEGER; -- highest torn_news_id already ingested for this session's armory usage
ALTER TABLE chain_watch_sessions ADD COLUMN armory_backfilled INTEGER DEFAULT 0; -- true once a scan has reached session.started_at at least once (same optimisation war tracking uses — a routine poll can then stop as soon as it hits an already-logged item)
ALTER TABLE chain_watch_sessions ADD COLUMN backfill_status TEXT; -- NULL | 'running' | 'done' | 'error'
ALTER TABLE chain_watch_sessions ADD COLUMN backfill_note TEXT; -- human-readable progress/result, shown in the UI

-- One row per chain-counted attack (attack.chain > 0) by one of our own
-- faction's members during this session — the source for per-member
-- Attacks/Energy Out and the faction totals.
CREATE TABLE chain_watch_attacks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  torn_attack_id INTEGER NOT NULL,
  attacker_id INTEGER NOT NULL,
  attacker_name TEXT,
  chain_position INTEGER,
  respect_gain REAL,
  started_at INTEGER NOT NULL,
  UNIQUE(session_id, torn_attack_id)
);
CREATE INDEX idx_chain_watch_attacks_session ON chain_watch_attacks(session_id);
CREATE INDEX idx_chain_watch_attacks_attacker ON chain_watch_attacks(session_id, attacker_id);

-- One row per faction-armory withdrawal/use (Xanax or an energy can) during
-- this session — the source for "Faction Energy In". Same news-feed source
-- and parser war tracking's armory ingestion already uses.
CREATE TABLE chain_watch_armory_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  torn_news_id INTEGER NOT NULL,
  torn_user_id INTEGER NOT NULL,
  username TEXT,
  item_name TEXT NOT NULL,
  used_at INTEGER NOT NULL,
  UNIQUE(session_id, torn_news_id)
);
CREATE INDEX idx_chain_watch_armory_session ON chain_watch_armory_usage(session_id);
