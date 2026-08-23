-- Free-form "Other" expenses tied to a specific war (e.g. travel items, a
-- one-off item bought for the war effort) — a comment + amount, distinct
-- from the auto-tracked armory usage/deposits and bounty spend. Feeds into
-- War Economics' net_profit the same way those do.
CREATE TABLE IF NOT EXISTS war_other_expenses (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  ranked_war_id        INTEGER NOT NULL,
  faction_id           INTEGER NOT NULL,
  amount               REAL NOT NULL,
  comment              TEXT NOT NULL,
  created_by           INTEGER,
  created_by_username  TEXT,
  created_at           INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_war_other_expenses_war ON war_other_expenses(ranked_war_id);
