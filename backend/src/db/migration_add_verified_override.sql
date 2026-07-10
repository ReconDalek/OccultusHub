-- When leadership applies Verify Data, this flag forces the war detail endpoint
-- to always trust summary_json over live-computed war_attacks stats — otherwise
-- an apply is silently ignored for any war whose raw attack rows haven't been
-- purged yet (which is always true pre-payout, i.e. exactly when Verify is used).
ALTER TABLE ranked_wars ADD COLUMN verified_override INTEGER DEFAULT 0;
