-- Migration: Add api_key and is_owner columns, update cache table schemas

-- Add missing columns to users table
ALTER TABLE users ADD COLUMN api_key TEXT;
ALTER TABLE users ADD COLUMN is_owner INTEGER DEFAULT 0;

-- Update faction_cache to match our needs (add error tracking)
ALTER TABLE faction_cache ADD COLUMN error TEXT;
ALTER TABLE faction_cache ADD COLUMN fetched_at DATETIME;

-- Update company_cache to match our needs (add error tracking)
ALTER TABLE company_cache ADD COLUMN error TEXT;
ALTER TABLE company_cache ADD COLUMN fetched_at DATETIME;

