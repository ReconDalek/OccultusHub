-- Migration: Add is_owner column to users table
ALTER TABLE users ADD COLUMN is_owner INTEGER DEFAULT 0;

-- Set user with torn_user_id 2741093 as owner
UPDATE users SET is_owner = 1 WHERE torn_user_id = 2741093;
