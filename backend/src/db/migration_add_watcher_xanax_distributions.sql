-- Chain Watch "Watcher Xanax": each watched hour that has already passed
-- (a chain_watch_shifts row with slot_start in the past) earns 1 Xanax. A
-- payout row marks everything up to and including paid_up_to_slot_start as
-- paid for that member, so the next lookup only counts hours watched after
-- that point — no month/period bucket needed, just a running high-water mark.
-- Run: wrangler d1 execute occultusdb --remote --file=src/db/migration_add_watcher_xanax_distributions.sql

CREATE TABLE IF NOT EXISTS watcher_xanax_distributions (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  torn_user_id           INTEGER NOT NULL,
  hours_paid             INTEGER NOT NULL,
  paid_up_to_slot_start  INTEGER NOT NULL,
  given_by               INTEGER NOT NULL,
  given_by_username      TEXT NOT NULL,
  given_at               INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_watcher_xanax_distributions_user
  ON watcher_xanax_distributions(torn_user_id);
