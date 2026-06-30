-- Duel cooldown tracking
ALTER TABLE familiars ADD COLUMN last_dueled_at DATETIME;
