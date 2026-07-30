-- Bounty tracking: defensive bounties placed on our own members during a war,
-- detected from a Discord bot webhook or entered manually. Feeds the "Bounties"
-- expense line in War Economics via SUM(total_cost) WHERE ranked_war_id=?.
CREATE TABLE IF NOT EXISTS bounties (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  placed_at          INTEGER NOT NULL,               -- unix epoch, parsed from the log line's own timestamp
  placer_torn_id     INTEGER,                        -- parsed from Discord nickname "[ID]" -- exact, no lookup needed
  placer_username    TEXT,
  target_username    TEXT NOT NULL,                  -- as parsed, e.g. "Sahil007"
  target_torn_id     INTEGER,                        -- resolved via faction_members lookup; nullable if not found
  faction_id         INTEGER,                        -- target's faction; nullable if not resolvable
  ranked_war_id      INTEGER,                        -- nullable; auto-assigned at insert if faction+timeframe match a war, editable after
  bounty_count       INTEGER NOT NULL DEFAULT 1,      -- the "1x" multiplier
  bounty_value       INTEGER NOT NULL,                -- the $300,001 per-bounty value Torn shows
  total_cost         INTEGER NOT NULL,                -- the $450,002 actual expense (includes Torn's fee)
  source             TEXT NOT NULL DEFAULT 'discord', -- 'discord' | 'manual'
  discord_message_id TEXT,                            -- dedup key for discord-sourced rows
  created_by         INTEGER,                         -- users.id, for manual entries
  created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes              TEXT,
  UNIQUE(discord_message_id, placed_at, target_username)
);
CREATE INDEX IF NOT EXISTS idx_bounties_ranked_war ON bounties(ranked_war_id);
CREATE INDEX IF NOT EXISTS idx_bounties_faction ON bounties(faction_id, placed_at);
