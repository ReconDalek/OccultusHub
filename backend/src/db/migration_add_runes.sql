-- Migration: Add rune casting game support
-- Run: npx wrangler d1 execute occultusdb --env production --remote --file=src/db/migration_add_runes.sql

ALTER TABLE users ADD COLUMN rune_points INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN last_rune_cast_at DATETIME;

CREATE TABLE IF NOT EXISTS rune_casts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  rune1 TEXT NOT NULL,
  rune2 TEXT NOT NULL,
  rune3 TEXT NOT NULL,
  bonus_type TEXT,
  points INTEGER NOT NULL,
  cast_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rune_casts_user_id ON rune_casts(user_id);
CREATE INDEX IF NOT EXISTS idx_users_rune_points ON users(rune_points DESC);
