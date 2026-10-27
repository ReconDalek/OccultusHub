-- Backfill was trying to do the whole job (potentially thousands of attack-
-- log pages for a long, high-member-count chain) in a single ctx.waitUntil
-- call — Cloudflare kills a background task that runs too long with no way
-- to resume it, which is exactly the "stuck on Starting..." symptom seen
-- live. backfill_phase tracks which stage a session's backfill is in
-- ('attacks' | 'armory' | NULL once done) so the cron can continue it in
-- small, bounded chunks across multiple ticks instead of one giant run.
ALTER TABLE chain_watch_sessions ADD COLUMN backfill_phase TEXT;

-- Donator status was being looked up live from Torn on every single
-- GET /economics request, once per refill-active member — for a large
-- chain that's dozens of live API calls on every page load. Cached here
-- instead, refreshed a few at a time per request so a page load is never
-- blocked on more than a handful of new lookups.
CREATE TABLE IF NOT EXISTS member_donator_status (
  torn_user_id INTEGER PRIMARY KEY,
  is_donator INTEGER NOT NULL DEFAULT 0,
  checked_at INTEGER NOT NULL
);
