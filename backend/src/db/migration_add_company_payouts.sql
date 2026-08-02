-- Tracks whether a company's 30% faction cut has been collected from the
-- director for a given calendar month — separate from principal_paid
-- (company_profit_cache), which tracks the one-time 4B principal repayment.
CREATE TABLE IF NOT EXISTS company_payouts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id  INTEGER NOT NULL,
  year        INTEGER NOT NULL,
  month       INTEGER NOT NULL,
  paid        INTEGER NOT NULL DEFAULT 0,
  paid_by     INTEGER,
  paid_at     DATETIME,
  UNIQUE(company_id, year, month)
);
