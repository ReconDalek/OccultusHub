-- Dormancy + happiness decay columns
ALTER TABLE familiars ADD COLUMN dormant INTEGER NOT NULL DEFAULT 0;
ALTER TABLE familiars ADD COLUMN dormant_at DATETIME;
ALTER TABLE familiars ADD COLUMN last_happiness_decay_at DATETIME;
