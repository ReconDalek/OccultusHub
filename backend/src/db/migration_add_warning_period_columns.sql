-- Adds structured period columns to member_warnings so a warning's stated
-- period (e.g. "June 2026") can drive date math (perk-eligibility blocking)
-- instead of only being a free-text display label.
-- Run: wrangler d1 execute occultusdb --remote --file=src/db/migration_add_warning_period_columns.sql

ALTER TABLE member_warnings ADD COLUMN period_month INTEGER;  -- 1-12
ALTER TABLE member_warnings ADD COLUMN period_year  INTEGER;  -- e.g. 2026

CREATE INDEX IF NOT EXISTS idx_member_warnings_period
  ON member_warnings(period_year, period_month);
