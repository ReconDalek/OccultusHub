-- Supports reusing ONE Discord webhook across different destinations by
-- retargeting it (PATCH channel_id) immediately before each send, instead of
-- assuming the webhook is permanently pinned to one channel.
--   target_mode = 'channel' -> channel_id is where to post (blank = post
--                              wherever the webhook is currently pointed,
--                              today's unchanged default behaviour)
--   target_mode = 'thread'  -> channel_id is the THREAD'S PARENT channel
--                              (the webhook must be retargeted there first —
--                              Discord's ?thread_id= execute param only
--                              accepts threads under the webhook's own
--                              current channel), thread_id is the actual
--                              forum post / thread to post into
ALTER TABLE webhook_configs ADD COLUMN target_mode TEXT NOT NULL DEFAULT 'channel';
ALTER TABLE webhook_configs ADD COLUMN channel_id TEXT;
