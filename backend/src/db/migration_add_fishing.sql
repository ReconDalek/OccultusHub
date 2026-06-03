-- Migration: Add fishing game support
-- Run against production D1: npx wrangler d1 execute occultusdb --env production --file=src/db/migration_add_fishing.sql

ALTER TABLE users ADD COLUMN fishing_points INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS fishing_catches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  fish_name TEXT NOT NULL,
  fish_rarity TEXT NOT NULL,
  points INTEGER NOT NULL,
  caught_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fishing_catches_user_id ON fishing_catches(user_id);
CREATE INDEX IF NOT EXISTS idx_users_fishing_points ON users(fishing_points DESC);
