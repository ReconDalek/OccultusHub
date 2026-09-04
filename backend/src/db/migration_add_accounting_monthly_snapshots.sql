-- Freezes accounting_controller.getSummary()'s full per-faction result for a
-- completed calendar month, so viewing a past month on the Accounting
-- Overview never re-derives figures from today's drifted item prices (armory
-- expense, OD insurance, OC item costs) or from data that may no longer be
-- queryable the same way. Captured once at month-end by cron; the live
-- endpoint prefers this frozen row for any past month it exists for, and
-- only falls back to a live recompute for months before this table existed.
CREATE TABLE IF NOT EXISTS accounting_monthly_snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  faction_id    INTEGER NOT NULL,
  year          INTEGER NOT NULL,
  month         INTEGER NOT NULL,  -- 1-indexed
  summary_json  TEXT    NOT NULL, -- full getSummary() response shape for this one faction
  snapshotted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(faction_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_accounting_snapshots_lookup
  ON accounting_monthly_snapshots(faction_id, year, month);
