-- Rebuild accounting tables with updated schema
DROP TABLE IF EXISTS accounting_stock_collections;
DROP TABLE IF EXISTS accounting_stocks;
DROP TABLE IF EXISTS accounting_investments;

CREATE TABLE accounting_investments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  torn_user_id INTEGER NOT NULL,
  discord_id TEXT,
  faction_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  rate REAL NOT NULL DEFAULT 0,
  duration_months INTEGER NOT NULL,
  member_profit_pct REAL NOT NULL DEFAULT 100,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  tci_purchased INTEGER DEFAULT 0,
  tci_purchased_at TEXT,
  tci_received INTEGER DEFAULT 0,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE accounting_stocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  torn_user_id INTEGER NOT NULL,
  discord_id TEXT,
  faction_id INTEGER NOT NULL,
  stock_acronym TEXT NOT NULL,
  tier INTEGER NOT NULL DEFAULT 1,
  payout_frequency TEXT NOT NULL DEFAULT '28-day',
  member_keeps_amount REAL NOT NULL DEFAULT 0,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE accounting_stock_collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_entry_id INTEGER NOT NULL REFERENCES accounting_stocks(id),
  torn_user_id INTEGER NOT NULL,
  period_label TEXT NOT NULL,
  amount_paid REAL NOT NULL DEFAULT 0,
  collected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  collected_by INTEGER,
  notes TEXT
);
