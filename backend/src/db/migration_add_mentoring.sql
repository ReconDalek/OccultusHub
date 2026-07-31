CREATE TABLE IF NOT EXISTS mentors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  torn_user_id INTEGER NOT NULL UNIQUE,
  username TEXT NOT NULL,
  faction_id INTEGER,
  timezone_offset REAL,
  is_active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  added_by INTEGER,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  removed_at DATETIME
);

CREATE TABLE IF NOT EXISTS mentees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  torn_user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  faction_id INTEGER,
  timezone_offset REAL,
  mentor_id INTEGER REFERENCES mentors(id),
  status TEXT NOT NULL DEFAULT 'active',
  step_first_mailer INTEGER NOT NULL DEFAULT 0,
  step_mansion_offer INTEGER NOT NULL DEFAULT 0,
  step_joined_discord INTEGER NOT NULL DEFAULT 0,
  step_joined_tornstats INTEGER NOT NULL DEFAULT 0,
  account_age_at_added INTEGER,
  level_at_added INTEGER,
  level_15_reached_at TEXT,
  account_age_days_at_level_15 INTEGER,
  incentive_amount REAL,
  incentive_paid INTEGER NOT NULL DEFAULT 0,
  incentive_paid_at DATETIME,
  incentive_paid_by INTEGER,
  incentive_paid_by_username TEXT,
  notes TEXT,
  added_by INTEGER,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  removed_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_mentees_status ON mentees(status);
CREATE INDEX IF NOT EXISTS idx_mentees_mentor ON mentees(mentor_id);

CREATE TABLE IF NOT EXISTS mentor_resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  body TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
