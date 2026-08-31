-- The Pact — occult 18-night ritual/business-sim. Session-based, solo or teams.
-- See docs/the-pact/design.html.

CREATE TABLE IF NOT EXISTS pact_sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,             -- 6-char join code
  season_id     INTEGER NOT NULL DEFAULT 1,
  host_user_id  INTEGER,
  mode          TEXT NOT NULL DEFAULT 'solo',     -- solo | team
  status        TEXT NOT NULL DEFAULT 'lobby',    -- lobby | playing | ended
  current_night INTEGER NOT NULL DEFAULT 1,
  night_ends_at DATETIME,                          -- set when timer_seconds > 0
  timer_seconds INTEGER NOT NULL DEFAULT 0,        -- 0 | 90 | 120 | 180
  is_practice   INTEGER NOT NULL DEFAULT 0,        -- 1 = admin playtest, never ranked
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at      DATETIME
);

CREATE TABLE IF NOT EXISTS pact_cabals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    INTEGER NOT NULL REFERENCES pact_sessions(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',   -- active | won | broken | abandoned
  night         INTEGER NOT NULL DEFAULT 1,
  gold          INTEGER NOT NULL DEFAULT 1000,
  offerings     INTEGER NOT NULL DEFAULT 0,
  dominion      INTEGER NOT NULL DEFAULT 0,
  thralls       INTEGER NOT NULL DEFAULT 0,
  ledger        TEXT NOT NULL DEFAULT '[]',       -- JSON array, one entry per resolved night
  pending       TEXT NOT NULL DEFAULT '{}',       -- JSON { "<night>": [ { effects, band } ] }
  final_score   INTEGER,
  loyalty_mod   REAL,
  cash_mod      REAL,
  broke_on_night INTEGER,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pact_cabal_members (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  cabal_id   INTEGER NOT NULL REFERENCES pact_cabals(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active',      -- active | gave_up
  joined_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(cabal_id, user_id)
);

-- one vote row per member per night (solo = a single vote that is the commit)
CREATE TABLE IF NOT EXISTS pact_votes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  cabal_id   INTEGER NOT NULL REFERENCES pact_cabals(id) ON DELETE CASCADE,
  night      INTEGER NOT NULL,
  user_id    INTEGER NOT NULL,
  option     TEXT NOT NULL,                        -- A | B | C | D
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(cabal_id, night, user_id)
);

-- the locked choice + resolved outcome for a cabal on a night
CREATE TABLE IF NOT EXISTS pact_commits (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  cabal_id   INTEGER NOT NULL REFERENCES pact_cabals(id) ON DELETE CASCADE,
  night      INTEGER NOT NULL,
  option     TEXT NOT NULL,
  band       TEXT,                                 -- ill-fortune | the-turning | favour | null
  face       INTEGER,                              -- 1..6 or null
  deltas     TEXT NOT NULL DEFAULT '{}',           -- JSON { gold, offerings, dominion, thralls }
  auto       INTEGER NOT NULL DEFAULT 0,           -- 1 = timer forced the hold option
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(cabal_id, night)
);

CREATE INDEX IF NOT EXISTS idx_pact_sessions_code    ON pact_sessions(code);
CREATE INDEX IF NOT EXISTS idx_pact_sessions_status  ON pact_sessions(status);
CREATE INDEX IF NOT EXISTS idx_pact_cabals_session   ON pact_cabals(session_id);
CREATE INDEX IF NOT EXISTS idx_pact_cabals_score     ON pact_cabals(final_score DESC);
CREATE INDEX IF NOT EXISTS idx_pact_members_cabal    ON pact_cabal_members(cabal_id);
CREATE INDEX IF NOT EXISTS idx_pact_members_user     ON pact_cabal_members(user_id);
CREATE INDEX IF NOT EXISTS idx_pact_votes_cabal_night ON pact_votes(cabal_id, night);
CREATE INDEX IF NOT EXISTS idx_pact_commits_cabal    ON pact_commits(cabal_id);
