-- Add chain hit count to war_attacks for bonus respect detection
ALTER TABLE war_attacks ADD COLUMN chain_count INTEGER DEFAULT 0;
