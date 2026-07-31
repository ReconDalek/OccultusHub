-- Documentation-only migration. These three tables are live in production D1
-- but had no CREATE TABLE anywhere in this migration folder (created ad hoc
-- via wrangler d1 execute at some point) -- found while building the member
-- profile card, which reads from all three. All CREATE TABLE IF NOT EXISTS,
-- so this is a no-op against the already-live schema; it exists purely so
-- the schema is reproducible from a clean database.

CREATE TABLE IF NOT EXISTS energy_snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  torn_user_id  INTEGER NOT NULL,
  username      TEXT,
  faction_id    INTEGER NOT NULL,
  energy_total  INTEGER NOT NULL,
  snapshot_date TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS personal_stats_snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  torn_user_id  INTEGER NOT NULL,
  username      TEXT,
  faction_id    INTEGER,
  snapshot_date TEXT NOT NULL,  -- YYYY-MM-DD UTC
  stats         TEXT NOT NULL,  -- full personalstats JSON blob
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS member_warnings (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  torn_user_id       INTEGER NOT NULL,
  username           TEXT NOT NULL,
  date_reported      TEXT NOT NULL,
  date_issued        TEXT,
  period             TEXT NOT NULL,
  warning_type       TEXT NOT NULL,
  target_value       REAL,
  achieved_value     REAL,
  comment            TEXT,
  issued_by          INTEGER,
  issued_by_username TEXT,
  created_at         INTEGER NOT NULL DEFAULT (unixepoch()),
  period_month       INTEGER,
  period_year        INTEGER
);
