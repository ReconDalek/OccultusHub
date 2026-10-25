-- Lets a Watcher Xanax payout cover an arbitrary date range (not just
-- "everything owed since the last payout") by recording the range's start
-- alongside its existing end. Existing rows default to 0 — i.e. "everything
-- up to paid_up_to_slot_start" — which preserves their original meaning.
-- Run: wrangler d1 execute occultusdb --remote --file=src/db/migration_add_watcher_xanax_paid_from.sql

ALTER TABLE watcher_xanax_distributions ADD COLUMN paid_from_slot_start INTEGER NOT NULL DEFAULT 0;
