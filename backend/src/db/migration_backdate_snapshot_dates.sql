-- One-time backfill (2026-08-02): energy_snapshots and company_profit_snapshots
-- were being stamped with the calendar date the 01:00 UTC cron ran on. But
-- Torn only updates gymenergy totals / company daily income-wages-advert
-- once per day, so whatever value is read at 01:00 UTC (an hour into the new
-- day) is still yesterday's completed data, not today's. Every existing row
-- in both tables is off by one day. (personal_stats_snapshots already stamps
-- with yesterday's date and needs no backfill.)
--
-- Two-phase shift avoids a transient UNIQUE constraint collision mid-update
-- (a single "date = date - 1" UPDATE can momentarily write two rows to the
-- same (user/company, date) slot depending on internal row processing order).
-- Phase 1 relocates every row far outside the real data range (which spans
-- at most ~6 months, well under 1000 days); phase 2 brings the whole
-- (now-isolated, so collision-free) cluster back to exactly one day earlier
-- than its original date.

UPDATE energy_snapshots SET snapshot_date = date(snapshot_date, '-1000 days');
UPDATE energy_snapshots SET snapshot_date = date(snapshot_date, '+999 days');

UPDATE company_profit_snapshots SET snapshot_date = date(snapshot_date, '-1000 days');
UPDATE company_profit_snapshots SET snapshot_date = date(snapshot_date, '+999 days');
