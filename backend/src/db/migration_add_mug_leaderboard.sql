-- Adds the 4th stat-gain leaderboard type ("Thieves Den" / mug), migrated
-- off the Discord bot's old MugLeaderboard Google Sheet onto the same
-- leaderboard_config mechanism as faction/social/event. Not configured with
-- a stat/month here -- set that from Leadership > Scheduling > Leaderboards
-- (pick "Money Mugged" as the stat to match the old sheet's behavior).
INSERT OR IGNORE INTO leaderboard_config (type) VALUES ('mug');
