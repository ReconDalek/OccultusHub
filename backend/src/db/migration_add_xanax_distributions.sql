-- Tracks monthly xanax perk distributions per member, replacing the
-- Google Apps Script sync sheet the Occultus Operations userscript used to
-- read/write. A row = that member's distribution is complete for that month.
-- Run: wrangler d1 execute occultusdb --remote --file=src/db/migration_add_xanax_distributions.sql

CREATE TABLE IF NOT EXISTS xanax_distributions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  torn_user_id        INTEGER NOT NULL,
  distribution_year   INTEGER NOT NULL,
  distribution_month  INTEGER NOT NULL,   -- 1-12
  quantity            INTEGER NOT NULL,
  given_by            INTEGER NOT NULL,   -- issuer's torn_user_id
  given_by_username   TEXT NOT NULL,
  given_at            INTEGER NOT NULL,   -- unix seconds
  UNIQUE(torn_user_id, distribution_year, distribution_month)
);

CREATE INDEX IF NOT EXISTS idx_xanax_distributions_lookup
  ON xanax_distributions(distribution_year, distribution_month);
