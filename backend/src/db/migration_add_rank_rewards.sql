-- Rank rewards: the monthly rank perk (base item × coefficient) moves from
-- hardcoded constants in the Occultus Operations userscript / xanaxController
-- to leadership-managed config (Leadership → Ranks → Rank Rewards). The
-- userscript reads the computed per-member quantities from /api/leadership/xanax.

-- Single-row base settings: what is given and how many at x1.0.
CREATE TABLE IF NOT EXISTS rank_reward_settings (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  base_quantity  INTEGER NOT NULL DEFAULT 5,
  item_id        INTEGER NOT NULL DEFAULT 206,
  item_name      TEXT    NOT NULL DEFAULT 'Xanax',
  armory_tab     TEXT    NOT NULL DEFAULT 'drugs',  -- faction armoury sub-tab the userscript opens to give it
  updated_by     TEXT,
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO rank_reward_settings (id) VALUES (1);

-- Coefficient per earned rank (rank itself still comes from total hits —
-- see MemberRanksTab / memberController). 0 = no reward for that rank.
CREATE TABLE IF NOT EXISTS rank_reward_ranks (
  rank_name    TEXT PRIMARY KEY,
  coefficient  REAL    NOT NULL,
  sort_order   INTEGER NOT NULL
);
INSERT OR IGNORE INTO rank_reward_ranks (rank_name, coefficient, sort_order) VALUES
  ('Harbinger', 1.8, 1),
  ('Doomsayer', 1.6, 2),
  ('Sentinel',  1.4, 3),
  ('Arcanist',  1.2, 4),
  ('Adept',     1.0, 5),
  ('Acolyte',   0,   6);

-- Per-member coefficient bonuses. category 'energy' = previous month's
-- average daily energy (gym + attacks, same figure as Warnings → Generate →
-- Energy). Within a category only the HIGHEST threshold a member reaches
-- applies (tiers, not cumulative) — each row's increment is the full bonus
-- for reaching that tier.
CREATE TABLE IF NOT EXISTS rank_reward_bonuses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category    TEXT    NOT NULL DEFAULT 'energy',
  threshold   REAL    NOT NULL,
  increment   REAL    NOT NULL,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_by  TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
