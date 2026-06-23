-- Item prices cache: one row per item, refreshed every 6 hours alongside armory
-- effective_price = MAX(market_price, sell_price) — used for armory valuation
CREATE TABLE IF NOT EXISTS item_prices_cache (
  item_id         INTEGER PRIMARY KEY,
  name            TEXT NOT NULL,
  effective_price INTEGER NOT NULL,
  market_price    INTEGER NOT NULL,
  sell_price      INTEGER NOT NULL,
  fetched_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
