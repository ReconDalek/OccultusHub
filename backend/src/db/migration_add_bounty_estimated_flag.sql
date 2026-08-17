-- Some bounty log messages are missing their "HH:MM:SS - DD/MM/YY" prefix
-- (Torn notification copy/paste quirk), so the parser falls back to a
-- neighboring line's timestamp or the Discord message's own post time.
-- This flag lets leadership spot those rows in the Bounties admin table and
-- correct placed_at via the existing Edit form if the estimate is off.
ALTER TABLE bounties ADD COLUMN placed_at_estimated INTEGER NOT NULL DEFAULT 0;
