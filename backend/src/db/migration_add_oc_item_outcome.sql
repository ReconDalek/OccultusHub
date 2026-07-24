-- Tracks whether a crime slot's required item was actually consumed and by
-- whom it was owned, so non-reusable faction-owned items can be counted as
-- an expense against Organized Crime profit.
ALTER TABLE oc_crime_slots ADD COLUMN item_outcome_owner TEXT;   -- 'user' | 'faction' | NULL
ALTER TABLE oc_crime_slots ADD COLUMN item_outcome_result TEXT;  -- 'used' | 'unused' | 'lost' | NULL
