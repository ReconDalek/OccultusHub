-- Records, at the moment a war's payout is locked in (Save to Rankings),
-- whether the live-tracked data had been Verified beforehand and who processed it.
ALTER TABLE ranked_wars ADD COLUMN payout_verified INTEGER DEFAULT 0;
ALTER TABLE ranked_wars ADD COLUMN payout_processed_by INTEGER;   -- FK -> users.id
ALTER TABLE ranked_wars ADD COLUMN payout_processed_at DATETIME;
