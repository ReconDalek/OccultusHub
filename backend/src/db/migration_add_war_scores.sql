-- Add live score tracking and summary storage to ranked_wars

ALTER TABLE ranked_wars ADD COLUMN our_score       INTEGER DEFAULT 0;
ALTER TABLE ranked_wars ADD COLUMN opponent_score  INTEGER DEFAULT 0;
ALTER TABLE ranked_wars ADD COLUMN target          INTEGER DEFAULT 0;
ALTER TABLE ranked_wars ADD COLUMN our_chain       INTEGER DEFAULT 0;
ALTER TABLE ranked_wars ADD COLUMN opponent_chain  INTEGER DEFAULT 0;
-- JSON blob of aggregated member stats stored when war ends and raw attacks are purged
ALTER TABLE ranked_wars ADD COLUMN summary_json    TEXT;
