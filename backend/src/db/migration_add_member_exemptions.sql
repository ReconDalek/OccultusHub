-- Leadership > Warnings > Exemptions: lets leadership log a reason to exclude
-- a member from a specific warning type over a date range (or a whole month),
-- so a genuine below-target member with a logged reason shows as a note
-- instead of a warning candidate in Generate.

CREATE TABLE IF NOT EXISTS member_exemptions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  torn_user_id        INTEGER NOT NULL,
  username            TEXT    NOT NULL,
  exemption_type      TEXT    NOT NULL, -- 'Energy' | 'Chain' | 'War' | 'All'
  date_start          TEXT    NOT NULL, -- YYYY-MM-DD, inclusive
  date_end            TEXT    NOT NULL, -- YYYY-MM-DD, inclusive
  reason              TEXT,
  created_by          INTEGER,
  created_by_username TEXT,
  created_at          INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_member_exemptions_torn_user_id ON member_exemptions(torn_user_id);
CREATE INDEX IF NOT EXISTS idx_member_exemptions_type         ON member_exemptions(exemption_type);
