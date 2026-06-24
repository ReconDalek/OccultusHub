-- Company profit cache: one row per invested company, refreshed every 6 hours
-- faction_cut = (income.daily - wages - advert) * 30 days * 30%
CREATE TABLE IF NOT EXISTS company_profit_cache (
  company_id    INTEGER PRIMARY KEY,
  name          TEXT    NOT NULL,
  director_id   INTEGER NOT NULL,
  director_name TEXT,
  faction_id    INTEGER,
  daily_income  INTEGER NOT NULL DEFAULT 0,
  daily_wages   INTEGER NOT NULL DEFAULT 0,
  daily_advert  INTEGER NOT NULL DEFAULT 0,
  daily_profit  INTEGER NOT NULL DEFAULT 0,
  faction_cut   INTEGER NOT NULL DEFAULT 0,
  principal     INTEGER NOT NULL DEFAULT 4000000000,
  has_api_key   INTEGER NOT NULL DEFAULT 0,
  fetched_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
