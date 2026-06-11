-- The Sanctum: Idle RPG game save state
CREATE TABLE IF NOT EXISTS sanctum_saves (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL UNIQUE,
  essence         REAL    NOT NULL DEFAULT 0,
  total_essence   REAL    NOT NULL DEFAULT 0,
  upgrades        TEXT    NOT NULL DEFAULT '{}',
  last_active_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sanctum_user  ON sanctum_saves(user_id);
CREATE INDEX IF NOT EXISTS idx_sanctum_total ON sanctum_saves(total_essence DESC);
