-- Optional Discord forum post / thread ID per webhook event type. When set,
-- messages are posted into that existing thread (Discord's webhook execute
-- API accepts a ?thread_id= query param) instead of the channel's main feed —
-- lets a webhook target a specific forum post.
ALTER TABLE webhook_configs ADD COLUMN thread_id TEXT;
