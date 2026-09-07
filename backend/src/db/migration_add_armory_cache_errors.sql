-- Surfaces per-category armory fetch failures durably, so they're visible in
-- the admin Cache panel instead of only ever appearing in a console.log/warn
-- during the 6h cron run (invisible unless someone happens to be tailing logs
-- at that exact moment). NULL when the most recent fetch had no failures.
ALTER TABLE armory_cache ADD COLUMN last_errors   TEXT;
ALTER TABLE armory_cache ADD COLUMN last_error_at DATETIME;
