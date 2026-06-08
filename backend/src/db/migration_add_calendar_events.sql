-- Add calendar_start_time to users (stores torn user calendar preference, e.g. "10:00 TCT")
ALTER TABLE users ADD COLUMN calendar_start_time TEXT DEFAULT NULL;

-- Add source/dedup/fixed-time columns to events for Torn API imports
ALTER TABLE events ADD COLUMN source TEXT DEFAULT 'manual';
ALTER TABLE events ADD COLUMN torn_ref TEXT DEFAULT NULL;
ALTER TABLE events ADD COLUMN fixed_start_time INTEGER DEFAULT 1;

-- Unique index so re-importing torn events upserts rather than duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_torn_ref ON events(torn_ref) WHERE torn_ref IS NOT NULL;
