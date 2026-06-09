-- Track whether a CAH player is still active in the game (supports mid-game leave/rejoin)
ALTER TABLE cah_players ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;

-- Extend existing lobby expiry to 1 hour (global persistent lobby)
UPDATE cah_rooms SET lobby_expires_at = datetime('now', '+60 minutes') WHERE status = 'lobby';
