-- Daily per-item stock snapshots for tracked companies (Accounting > Overview
-- stock summary + staffing suggestions). Fed by the same 01:00 UTC cron that
-- already captures company profit (fetchAndCacheCompanyProfits), which now
-- also requests `stock` in its selections — no extra API call.
--   in_stock / on_order / sold_amount / sold_worth / price : straight from Torn
--   generated : sold_amount + (in_stock - yesterday's in_stock for this item);
--               NULL on an item's first tracked day (no baseline yet)
CREATE TABLE IF NOT EXISTS company_stock_snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id    INTEGER NOT NULL,
  item_id       INTEGER NOT NULL,
  item_name     TEXT,
  snapshot_date TEXT NOT NULL,
  price         INTEGER,
  in_stock      INTEGER NOT NULL DEFAULT 0,
  on_order      INTEGER NOT NULL DEFAULT 0,
  sold_amount   INTEGER NOT NULL DEFAULT 0,
  sold_worth    INTEGER NOT NULL DEFAULT 0,
  generated     INTEGER,
  fetched_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, item_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_company_stock_snapshots_company ON company_stock_snapshots(company_id, snapshot_date);

-- Global (not per-company) thresholds for the low/high stock staffing
-- suggestion, editable from Accounting > Overview. INSERT OR IGNORE so
-- re-running this migration is a no-op if already applied.
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('company_stock_low_threshold', '1000');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('company_stock_high_threshold', '9000');
