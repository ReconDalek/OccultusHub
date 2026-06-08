-- The Rite: Occultus Mafia game tables

CREATE TABLE IF NOT EXISTS game_rooms (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT NOT NULL UNIQUE,           -- 6-char join code
  status       TEXT NOT NULL DEFAULT 'lobby',  -- lobby | day | night | ended
  phase        INTEGER NOT NULL DEFAULT 0,     -- increments each day/night cycle
  phase_type   TEXT,                           -- 'day' | 'night'
  phase_ends_at DATETIME,
  host_name    TEXT NOT NULL,
  winner       TEXT,                           -- 'cabal' | 'congregation' | null
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at     DATETIME
);

CREATE TABLE IF NOT EXISTS game_players (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id       INTEGER NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  user_id       INTEGER,                        -- null for guests
  display_name  TEXT NOT NULL,
  role          TEXT,                           -- assigned at game start: congregation|cabal|inquisitor|warden
  is_alive      INTEGER NOT NULL DEFAULT 1,
  is_host       INTEGER NOT NULL DEFAULT 0,
  guest_token   TEXT,                           -- unique token for unauthenticated guests
  joined_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id      INTEGER NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  player_id    INTEGER,                         -- null = Oracle/system message
  display_name TEXT NOT NULL,
  message      TEXT NOT NULL,
  channel      TEXT NOT NULL DEFAULT 'public',  -- public | cabal
  phase        INTEGER NOT NULL DEFAULT 0,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_actions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id          INTEGER NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  player_id        INTEGER NOT NULL,
  action_type      TEXT NOT NULL,               -- kill | investigate | protect
  target_player_id INTEGER NOT NULL,
  phase            INTEGER NOT NULL,
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(room_id, player_id, phase)
);

CREATE TABLE IF NOT EXISTS game_votes (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id          INTEGER NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  voter_player_id  INTEGER NOT NULL,
  target_player_id INTEGER NOT NULL,
  phase            INTEGER NOT NULL,
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(room_id, voter_player_id, phase)
);

CREATE INDEX IF NOT EXISTS idx_game_rooms_code ON game_rooms(code);
CREATE INDEX IF NOT EXISTS idx_game_players_room ON game_players(room_id);
CREATE INDEX IF NOT EXISTS idx_game_messages_room_channel ON game_messages(room_id, channel);
CREATE INDEX IF NOT EXISTS idx_game_actions_room_phase ON game_actions(room_id, phase);
CREATE INDEX IF NOT EXISTS idx_game_votes_room_phase ON game_votes(room_id, phase);
