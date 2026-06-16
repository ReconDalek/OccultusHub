CREATE TABLE IF NOT EXISTS system_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  category TEXT NOT NULL,      -- 'api_call', 'api_error', 'auth', 'cron', 'game', 'admin', 'error'
  level TEXT NOT NULL,         -- 'info', 'warn', 'error'
  event TEXT NOT NULL,         -- short machine-readable event name e.g. 'torn_api_call'
  message TEXT NOT NULL,       -- human-readable description
  torn_user_id INTEGER,        -- user whose key / session was involved (no key value ever stored)
  username TEXT,
  faction_id INTEGER,
  meta TEXT                    -- JSON blob for any extra structured data
);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON system_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_category   ON system_logs(category);
CREATE INDEX IF NOT EXISTS idx_logs_level      ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_event      ON system_logs(event);
