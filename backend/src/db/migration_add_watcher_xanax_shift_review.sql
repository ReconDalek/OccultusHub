-- Watcher Xanax review: a shift with a leader's note (e.g. "late", "no-show")
-- doesn't auto-count toward payable hours until a leader decides — same idea
-- as the raffle's per-entry review, but persisted directly on the shift
-- itself since Watcher Xanax reads chain_watch_shifts live rather than
-- through a per-round snapshot.
-- Run: wrangler d1 execute occultusdb --remote --file=src/db/migration_add_watcher_xanax_shift_review.sql

ALTER TABLE chain_watch_shifts ADD COLUMN xanax_review_decision TEXT; -- NULL (no decision yet) | 'included' | 'excluded'
ALTER TABLE chain_watch_shifts ADD COLUMN xanax_reviewed_by INTEGER;
ALTER TABLE chain_watch_shifts ADD COLUMN xanax_reviewed_at DATETIME;

-- Replaces the old [paid_from_slot_start, paid_up_to_slot_start] interval
-- with one row per exact paid hour. An interval can't coexist with review
-- gating correctly — a noted hour sitting inside an otherwise-paid interval
-- would look "already paid" (and so permanently skip future owed/paid
-- checks) even though it was never actually counted, the moment it's later
-- included or excluded. watcher_xanax_distributions.paid_from_slot_start/
-- paid_up_to_slot_start are left in place (unused going forward) rather than
-- dropped, since SQLite column drops require a full table rebuild.
CREATE TABLE IF NOT EXISTS watcher_xanax_paid_slots (
  torn_user_id    INTEGER NOT NULL,
  slot_start      INTEGER NOT NULL,
  distribution_id INTEGER NOT NULL REFERENCES watcher_xanax_distributions(id),
  PRIMARY KEY (torn_user_id, slot_start)
);

-- Backfills existing payouts' intervals into exact slots — safe because
-- every hour in an old interval really was paid in full (review gating
-- didn't exist yet, so nothing in that range could have been pending/excluded).
INSERT OR IGNORE INTO watcher_xanax_paid_slots (torn_user_id, slot_start, distribution_id)
SELECT s.torn_user_id, s.slot_start, d.id
FROM watcher_xanax_distributions d
JOIN chain_watch_shifts s
  ON s.torn_user_id = d.torn_user_id
  AND s.slot_start >= d.paid_from_slot_start
  AND s.slot_start <= d.paid_up_to_slot_start;
