-- Armory usage backfill tracking: trackActiveWars pages armoryAction news
-- newest → oldest and normally stops at the first already-logged item. That
-- stop is only safe once the war's whole armory window (armoryFrom → now) has
-- been fetched at least once — otherwise a truncated first poll (found live
-- 2026-10-01, war 189: 100 of a ~2-day backlog) leaves a permanent gap below
-- the newest rows. 0 = keep paging past already-logged news back to the
-- window start; set to 1 once a poll reaches it.
ALTER TABLE ranked_wars ADD COLUMN armory_backfilled INTEGER NOT NULL DEFAULT 0;
