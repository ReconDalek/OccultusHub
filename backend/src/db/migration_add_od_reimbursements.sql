-- OD (overdose) item reimbursements — real tracked replacements, replacing
-- the personal-stats-based guess OD Insurance used to run on. One row per
-- overdose log detected in Discord that's eligible for reimbursement (Adept+
-- by our own rank, not Torn's). status moves pending -> completed (paid out,
-- value locked in at completion) or pending -> rejected (leadership decided
-- it doesn't qualify, e.g. the item was faction-supplied — no value recorded).
CREATE TABLE IF NOT EXISTS od_reimbursements (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  torn_user_id              INTEGER NOT NULL,
  username                  TEXT,
  faction_id                INTEGER NOT NULL,
  item_name                 TEXT NOT NULL DEFAULT 'Xanax',
  quantity                  INTEGER NOT NULL DEFAULT 1,
  status                    TEXT NOT NULL DEFAULT 'pending', -- pending | completed | rejected
  discord_message_id        TEXT,
  logged_at                 INTEGER NOT NULL, -- unix seconds, when the OD log was detected
  completed_at              INTEGER,          -- unix seconds
  completed_by              TEXT,             -- Discord id/username of whoever actioned it
  unit_price_at_completion  REAL,             -- frozen at completion, not re-priced later
  created_at                INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_od_reimb_status ON od_reimbursements(faction_id, status);
CREATE INDEX IF NOT EXISTS idx_od_reimb_member ON od_reimbursements(torn_user_id, status);
CREATE INDEX IF NOT EXISTS idx_od_reimb_completed_at ON od_reimbursements(completed_at);
