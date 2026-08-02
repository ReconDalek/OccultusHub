-- Tracks whether the placer has been repaid for a bounty's cost — separate
-- from bounties.total_cost itself, same paid/paid_by/paid_at audit pattern
-- used by company_payouts.
ALTER TABLE bounties ADD COLUMN paid INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bounties ADD COLUMN paid_by INTEGER;
ALTER TABLE bounties ADD COLUMN paid_at DATETIME;
