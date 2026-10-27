-- Lets a chain economics backfill resume across multiple passes/clicks
-- instead of restarting from "now" every time — needed for a long, high-
-- member-count chain where the attack feed (every attack by/against the
-- faction, not just chain hits) can run well past a single pass's page cap.
ALTER TABLE chain_watch_sessions ADD COLUMN backfill_oldest_ts INTEGER;
