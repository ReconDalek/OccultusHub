-- Logs armory deposits per faction, fetched from Torn's armoryDeposit news
-- category via each faction's leader key. Used for a read-only deposit log
-- display and for computing this month's Armory expense in Accounting.
CREATE TABLE IF NOT EXISTS armory_deposits (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  faction_id    INTEGER NOT NULL,
  torn_news_id  TEXT UNIQUE NOT NULL,
  torn_user_id  INTEGER NOT NULL,
  username      TEXT NOT NULL,
  item_name     TEXT NOT NULL,
  quantity      INTEGER NOT NULL,
  deposited_at  INTEGER NOT NULL,  -- Unix epoch seconds, from Torn news timestamp
  fetched_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_armory_deposits_faction_date ON armory_deposits(faction_id, deposited_at DESC);
