ALTER TABLE ranked_wars ADD COLUMN is_paid     INTEGER DEFAULT 0;
ALTER TABLE ranked_wars ADD COLUMN payout_json TEXT;
