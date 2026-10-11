-- Tracks which one-off faction merits (Massacre, Genocide, Wishful Thinking)
-- each member has already received, so the Chain Watch merit tracker can
-- exclude them from the "who's next" shortlist for that merit.
CREATE TABLE IF NOT EXISTS member_merits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  torn_user_id INTEGER NOT NULL,
  merit_type TEXT NOT NULL,
  awarded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  awarded_by INTEGER,
  UNIQUE(torn_user_id, merit_type)
);
CREATE INDEX IF NOT EXISTS idx_member_merits_type ON member_merits(merit_type);
