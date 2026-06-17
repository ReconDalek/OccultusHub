-- Accounting: Bank Investments
CREATE TABLE IF NOT EXISTS accounting_investments (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  torn_user_id        INTEGER NOT NULL,
  username            TEXT,
  faction_id          INTEGER NOT NULL,
  amount              REAL    NOT NULL DEFAULT 0,
  duration_months     INTEGER NOT NULL DEFAULT 1,  -- 1, 2, or 3
  start_date          TEXT    NOT NULL,             -- YYYY-MM-DD
  end_date            TEXT    NOT NULL,             -- YYYY-MM-DD (computed and stored)
  tci_purchased       INTEGER NOT NULL DEFAULT 0,  -- 0/1
  tci_purchased_at    TEXT,                         -- YYYY-MM-DD when TCI was marked purchased
  tci_received        INTEGER NOT NULL DEFAULT 0,  -- 0/1 (member confirmed receiving TCI)
  notes               TEXT,
  is_active           INTEGER NOT NULL DEFAULT 1,
  created_by          INTEGER,
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_acct_inv_user    ON accounting_investments(torn_user_id);
CREATE INDEX IF NOT EXISTS idx_acct_inv_faction ON accounting_investments(faction_id);

-- Accounting: Stock Scheme Members
CREATE TABLE IF NOT EXISTS accounting_stocks (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  torn_user_id        INTEGER NOT NULL,
  username            TEXT,
  faction_id          INTEGER NOT NULL,
  stock_acronym       TEXT    NOT NULL,  -- e.g. "TCI", "TCSE"
  stock_name          TEXT,              -- full name e.g. "Torn City Investments"
  tier                INTEGER,           -- stock benefit tier (1-10)
  payout_item         TEXT,              -- item name they receive
  payout_frequency    TEXT    NOT NULL DEFAULT '4-weekly',  -- '4-weekly' or 'monthly'
  item_value          REAL    NOT NULL DEFAULT 0,           -- estimated value per item (£)
  member_portion_pct  REAL    NOT NULL DEFAULT 100,         -- % member keeps
  faction_payment     REAL    NOT NULL DEFAULT 0,           -- calculated amount owed per period
  notes               TEXT,
  is_active           INTEGER NOT NULL DEFAULT 1,
  created_by          INTEGER,
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_acct_stock_user    ON accounting_stocks(torn_user_id);
CREATE INDEX IF NOT EXISTS idx_acct_stock_faction ON accounting_stocks(faction_id);

-- Accounting: Stock Collection Log (monthly payments)
CREATE TABLE IF NOT EXISTS accounting_stock_collections (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_entry_id  INTEGER NOT NULL REFERENCES accounting_stocks(id) ON DELETE CASCADE,
  torn_user_id    INTEGER NOT NULL,
  period_label    TEXT    NOT NULL,   -- e.g. "June 2026"
  amount_paid     REAL    NOT NULL DEFAULT 0,
  collected_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  collected_by    INTEGER,
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_acct_coll_entry ON accounting_stock_collections(stock_entry_id);
