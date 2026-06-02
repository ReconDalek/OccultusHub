-- occultusHub SQLite D1 Schema (matches production DB)
-- This schema is used for reference and fresh setup only
-- For existing databases, use migration files instead

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  torn_user_id INTEGER UNIQUE NOT NULL,
  username TEXT NOT NULL,
  faction_id INTEGER,
  faction_position TEXT,
  image_url TEXT,
  api_key TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME,
  is_admin INTEGER DEFAULT 0,
  is_owner INTEGER DEFAULT 0
);

-- Admin users audit trail
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  granted_by INTEGER,
  granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME,
  revoked_by INTEGER,
  reason TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(granted_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(revoked_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Page visibility settings
CREATE TABLE IF NOT EXISTS page_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_name TEXT UNIQUE NOT NULL,
  is_visible INTEGER DEFAULT 1,
  updated_by INTEGER,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(updated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Login history audit trail
CREATE TABLE IF NOT EXISTS login_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  login_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ip_address TEXT,
  user_agent TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- System settings key-value store
CREATE TABLE IF NOT EXISTS system_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table (for session management)
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT UNIQUE NOT NULL,
  torn_user_id INTEGER NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
  remember_me INTEGER DEFAULT 0
);

-- Faction cache (stores JSON faction data)
CREATE TABLE IF NOT EXISTS faction_cache (
  faction_id INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  error TEXT
);

-- Company cache (stores JSON company data)
CREATE TABLE IF NOT EXISTS company_cache (
  company_id INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  error TEXT,
  fetched_by_user INTEGER
);

-- Events (leadership-configurable calendar entries)
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  event_date TEXT NOT NULL,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Faction schedules (chain / war countdowns per faction)
CREATE TABLE IF NOT EXISTS faction_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  faction_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('chain', 'war')),
  scheduled_at TEXT NOT NULL,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Seed default page settings
INSERT OR IGNORE INTO page_settings (page_name, is_visible) VALUES ('factions', 1);
INSERT OR IGNORE INTO page_settings (page_name, is_visible) VALUES ('companies', 1);
INSERT OR IGNORE INTO page_settings (page_name, is_visible) VALUES ('leadership', 1);
INSERT OR IGNORE INTO page_settings (page_name, is_visible) VALUES ('respect', 1);

-- Seed default system settings
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('site_title', 'occultusHub');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('cache_expiry_minutes', '60');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('max_users', '1000');
