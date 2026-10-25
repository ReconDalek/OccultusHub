-- Tracks whether the 1-hour-before Discord DM reminder has already been
-- sent for a shift, so the reminder cron doesn't re-send on every tick.
ALTER TABLE chain_watch_shifts ADD COLUMN reminder_sent_at DATETIME;
