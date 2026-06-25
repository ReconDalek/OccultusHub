CREATE TABLE IF NOT EXISTS armory_minimums (
  item_id   INTEGER PRIMARY KEY,
  item_name TEXT    NOT NULL,
  category  TEXT    NOT NULL,
  min_33097 INTEGER,
  min_9171  INTEGER,
  min_9728  INTEGER,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
