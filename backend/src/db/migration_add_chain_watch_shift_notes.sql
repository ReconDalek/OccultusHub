-- Leader-left note on a watch shift (e.g. "didn't show up") — visible to
-- leadership only, surfaced in the frontend rather than enforced here.
ALTER TABLE chain_watch_shifts ADD COLUMN note TEXT;
