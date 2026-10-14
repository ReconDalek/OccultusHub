-- Admin Panel > Patch Notes: a single editable draft Claude appends to after
-- each major update, the user proofs/edits in place, then sends to Discord
-- with a button click. 'sent' rows are kept as history (most recent 10 shown).
CREATE TABLE IF NOT EXISTS patch_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  content    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'sent'
  sent_at    DATETIME,
  sent_by    INTEGER,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_patch_notes_status ON patch_notes(status, id DESC);
