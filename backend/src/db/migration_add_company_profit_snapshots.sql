-- Daily profit snapshots per company — one row per company per calendar day
-- faction_cut = daily_profit * 30% (faction's share for that day)
CREATE TABLE IF NOT EXISTS company_profit_snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id    INTEGER NOT NULL,
  snapshot_date DATE    NOT NULL,
  daily_income  INTEGER NOT NULL DEFAULT 0,
  daily_wages   INTEGER NOT NULL DEFAULT 0,
  daily_advert  INTEGER NOT NULL DEFAULT 0,
  daily_profit  INTEGER NOT NULL DEFAULT 0,
  faction_cut   INTEGER NOT NULL DEFAULT 0,
  UNIQUE(company_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_company_snapshots_lookup
  ON company_profit_snapshots(company_id, snapshot_date);
