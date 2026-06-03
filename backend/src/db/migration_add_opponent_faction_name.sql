-- Add opponent_faction_name column to faction_schedules
ALTER TABLE faction_schedules ADD COLUMN opponent_faction_name TEXT;
