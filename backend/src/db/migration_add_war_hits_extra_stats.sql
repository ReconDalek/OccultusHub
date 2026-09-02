-- Extra per-member per-war stats needed for the global War Stats leaderboard page.
-- war_hits already stores successful hits/respect gained; these add the rest of
-- what buildMemberStats/defendStats compute live but was previously discarded
-- once war_attacks rows are deleted at save-hits time.

ALTER TABLE war_hits ADD COLUMN respect_lost   REAL    DEFAULT 0;  -- respect lost defending (mirrors totals.total_respect_lost, per member)
ALTER TABLE war_hits ADD COLUMN war_attempts   INTEGER DEFAULT 0;  -- all war_attack rows regardless of outcome (war_hits + war_losses)
ALTER TABLE war_hits ADD COLUMN war_losses     INTEGER DEFAULT 0;  -- failed/escaped/interrupted war attacks
ALTER TABLE war_hits ADD COLUMN defends_won    INTEGER DEFAULT 0;  -- enemy attacked, failed
ALTER TABLE war_hits ADD COLUMN defends_lost   INTEGER DEFAULT 0;  -- enemy attacked, succeeded
ALTER TABLE war_hits ADD COLUMN avg_fair_fight REAL    DEFAULT 0;
