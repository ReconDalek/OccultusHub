-- Familiar naming + bond system
ALTER TABLE familiars ADD COLUMN name TEXT;
ALTER TABLE familiars ADD COLUMN bond INTEGER NOT NULL DEFAULT 0;
