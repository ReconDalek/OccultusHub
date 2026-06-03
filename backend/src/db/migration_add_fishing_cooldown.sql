-- Migration: Add fishing cast cooldown tracking
-- Run: npx wrangler d1 execute occultusdb --env production --remote --file=src/db/migration_add_fishing_cooldown.sql

ALTER TABLE users ADD COLUMN last_fished_at DATETIME;
