-- Lets leadership disable a leaderboard without clearing its stat/month
-- config — while inactive it tracks/shows nothing, same as unconfigured,
-- rather than continuing to display a stale prior month's standings.
ALTER TABLE leaderboard_config ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
