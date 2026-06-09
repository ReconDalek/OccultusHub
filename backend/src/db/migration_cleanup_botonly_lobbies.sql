-- Remove any game_rooms in 'lobby' status where no human players remain
-- (lobbies containing only bots — these are permanently stuck)
DELETE FROM game_rooms
WHERE status = 'lobby'
  AND id NOT IN (
    SELECT DISTINCT room_id FROM game_players WHERE is_bot = 0
  );
