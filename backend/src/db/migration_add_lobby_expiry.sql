-- Add lobby expiry timer to both game room tables
-- Lobby closes 5 minutes after last player joins (or creation if no one joins)
ALTER TABLE game_rooms ADD COLUMN lobby_expires_at DATETIME;
ALTER TABLE cah_rooms  ADD COLUMN lobby_expires_at DATETIME;

-- Clear stale lobbies immediately (any lobby-status room)
DELETE FROM game_rooms WHERE status = 'lobby';
DELETE FROM cah_rooms  WHERE status = 'lobby';
