-- Tracks a Torn API key Torn itself has flagged as temporarily unusable
-- (most commonly: the key owner hasn't logged into Torn recently enough,
-- which Torn calls "Key is temporarily disabled due to owner inactivity").
-- Once set, every key-selector function in tornApiService.js excludes this
-- user's key from the pool until they log back into Torn and into this
-- site again — the login flow re-validates the key against Torn and clears
-- the flag on success.
ALTER TABLE users ADD COLUMN api_key_disabled INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN api_key_disabled_at DATETIME;
ALTER TABLE users ADD COLUMN api_key_disabled_reason TEXT;
