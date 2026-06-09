-- Clear stuck in-progress Rite games (bots-only leftovers)
DELETE FROM game_rooms WHERE status IN ('day', 'night');

-- Add round-level phase timers to CAH
ALTER TABLE cah_rounds ADD COLUMN picking_ends_at DATETIME;
ALTER TABLE cah_rounds ADD COLUMN judging_ends_at DATETIME;
