-- Stock market cache tables
CREATE TABLE IF NOT EXISTS stock_list_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL,
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_detail_cache (
  stock_id INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_id INTEGER NOT NULL,
  price REAL NOT NULL,
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stock_price_history_stock_id ON stock_price_history (stock_id);
CREATE INDEX IF NOT EXISTS idx_stock_price_history_recorded_at ON stock_price_history (recorded_at);

-- Add stock_cost to accounting_stocks for networth tracking
ALTER TABLE accounting_stocks ADD COLUMN stock_cost REAL NOT NULL DEFAULT 0;
