CREATE TABLE IF NOT EXISTS familiars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  species TEXT NOT NULL,
  nature TEXT NOT NULL,
  stage INTEGER NOT NULL DEFAULT 1,
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  xp_to_next INTEGER NOT NULL DEFAULT 120,
  stat_str INTEGER NOT NULL,
  stat_agi INTEGER NOT NULL,
  stat_vit INTEGER NOT NULL,
  stat_arc INTEGER NOT NULL,
  stat_res INTEGER NOT NULL,
  stat_ess INTEGER NOT NULL,
  stat_points INTEGER NOT NULL DEFAULT 0,
  hp INTEGER NOT NULL,
  max_hp INTEGER NOT NULL,
  happiness INTEGER NOT NULL DEFAULT 80,
  shards INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  omen_active INTEGER NOT NULL DEFAULT 0,
  last_trained_at DATETIME,
  last_hunted_at DATETIME,
  last_rested_at DATETIME,
  last_login_event_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS familiar_battles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenger_id INTEGER NOT NULL,
  defender_id INTEGER NOT NULL,
  winner_id INTEGER,
  rounds_json TEXT NOT NULL,
  trigger TEXT NOT NULL DEFAULT 'manual',
  battled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(challenger_id) REFERENCES familiars(id),
  FOREIGN KEY(defender_id) REFERENCES familiars(id)
);

CREATE TABLE IF NOT EXISTS familiar_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  familiar_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(familiar_id) REFERENCES familiars(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS familiar_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  familiar_id INTEGER NOT NULL,
  item_key TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 0,
  UNIQUE(familiar_id, item_key),
  FOREIGN KEY(familiar_id) REFERENCES familiars(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_familiars_user ON familiars(user_id);
CREATE INDEX IF NOT EXISTS idx_familiar_events_unseen ON familiar_events(familiar_id, seen);
CREATE INDEX IF NOT EXISTS idx_familiar_battles_challenger ON familiar_battles(challenger_id);
CREATE INDEX IF NOT EXISTS idx_familiar_battles_defender ON familiar_battles(defender_id);
