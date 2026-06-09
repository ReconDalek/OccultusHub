-- Add is_bot flag to game player tables for admin test mode
ALTER TABLE game_players ADD COLUMN is_bot INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cah_players ADD COLUMN is_bot INTEGER NOT NULL DEFAULT 0;
