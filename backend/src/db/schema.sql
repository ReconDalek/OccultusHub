-- occultusHub SQLite D1 Schema (converted from PostgreSQL)

-- Drop existing tables if they exist (fresh setup)
DROP TABLE IF EXISTS login_history;
DROP TABLE IF EXISTS admin_users;
DROP TABLE IF EXISTS page_settings;
DROP TABLE IF EXISTS system_settings;
DROP TABLE IF EXISTS users;

-- Create users table
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  torn_user_id INTEGER UNIQUE NOT NULL,
  username TEXT NOT NULL,
  faction_id INTEGER,
  faction_position TEXT,
  image_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME,
  is_admin INTEGER DEFAULT 0
);

-- Create admin_users table (audit trail)
CREATE TABLE admin_users (
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

-- Create page_settings table
CREATE TABLE page_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_name TEXT UNIQUE NOT NULL,
  is_visible INTEGER DEFAULT 1,
  updated_by INTEGER,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(updated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Create login_history table
CREATE TABLE login_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  login_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ip_address TEXT,
  user_agent TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create system_settings table
CREATE TABLE system_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed default page settings
INSERT INTO page_settings (page_name, is_visible) VALUES ('factions', 1);
INSERT INTO page_settings (page_name, is_visible) VALUES ('companies', 1);
INSERT INTO page_settings (page_name, is_visible) VALUES ('leadership', 1);
INSERT INTO page_settings (page_name, is_visible) VALUES ('respect', 1);

-- Seed default system settings
INSERT INTO system_settings (key, value) VALUES ('site_title', 'occultusHub');
INSERT INTO system_settings (key, value) VALUES ('cache_expiry_minutes', '60');
INSERT INTO system_settings (key, value) VALUES ('max_users', '1000');
