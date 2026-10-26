-- Lets leadership correct who actually covered an already-completed shift
-- (e.g. the signed-up member never showed, someone else covered it
-- manually) — something only possible before a shift started until now.
-- original_torn_user_id preserves who was FIRST assigned even across
-- multiple reassignments (COALESCE'd, never overwritten once set).
ALTER TABLE chain_watch_shifts ADD COLUMN original_torn_user_id INTEGER;
ALTER TABLE chain_watch_shifts ADD COLUMN reassigned_by INTEGER;
ALTER TABLE chain_watch_shifts ADD COLUMN reassigned_at DATETIME;
