-- One config row per event type; UNIQUE on event_type so upserts are safe
CREATE TABLE IF NOT EXISTS webhook_configs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type       TEXT    NOT NULL UNIQUE,
  webhook_url      TEXT    NOT NULL DEFAULT '',
  mention_user_id  TEXT,
  message_template TEXT,
  enabled          INTEGER NOT NULL DEFAULT 0,
  last_triggered   DATETIME,
  last_status      TEXT,
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Prevents duplicate sends when cron re-runs or manual trigger hits same day
CREATE TABLE IF NOT EXISTS webhook_send_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT    NOT NULL,
  event_key  TEXT    NOT NULL,
  sent_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_type, event_key)
);

-- Seed the three event types so the UI always has rows to edit
INSERT OR IGNORE INTO webhook_configs (event_type) VALUES ('investment_tci');
INSERT OR IGNORE INTO webhook_configs (event_type) VALUES ('stock_monthly');
INSERT OR IGNORE INTO webhook_configs (event_type) VALUES ('armory_low');
