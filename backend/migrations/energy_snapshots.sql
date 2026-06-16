CREATE TABLE IF NOT EXISTS energy_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  torn_user_id INTEGER NOT NULL,
  username TEXT,
  faction_id INTEGER NOT NULL,
  energy_total INTEGER NOT NULL,
  snapshot_date TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_energy_snapshot_user_date ON energy_snapshots(torn_user_id, snapshot_date);
