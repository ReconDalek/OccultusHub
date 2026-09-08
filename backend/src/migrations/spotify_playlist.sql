-- Shared Spotify playlist ("Occultus Radio") — bottom-right overlay for
-- logged-in users. One "jukebox" Spotify account owns the playlist; its
-- refresh token lives here and every write goes through it. Members search
-- + add via the Worker (no per-user Spotify auth). See spotifyController.js.

CREATE TABLE IF NOT EXISTS spotify_config (
  id                   INTEGER PRIMARY KEY CHECK (id = 1),
  enabled              INTEGER NOT NULL DEFAULT 0,
  client_id            TEXT,
  playlist_id          TEXT,
  refresh_token        TEXT,           -- jukebox account, captured once via /api/spotify/callback
  jukebox_display_name TEXT,
  add_limit_per_day    INTEGER NOT NULL DEFAULT 5,
  updated_at           TEXT DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO spotify_config (id, enabled) VALUES (1, 0);

CREATE TABLE IF NOT EXISTS spotify_submissions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  track_uri         TEXT NOT NULL,
  track_id          TEXT NOT NULL,
  track_name        TEXT NOT NULL,
  artist            TEXT NOT NULL,
  album_art         TEXT,
  added_by_user_id  INTEGER NOT NULL,
  added_by_username TEXT NOT NULL,
  added_by_torn_id  INTEGER,
  created_at        TEXT DEFAULT CURRENT_TIMESTAMP,
  removed           INTEGER NOT NULL DEFAULT 0,
  removed_by        TEXT
);
CREATE INDEX IF NOT EXISTS idx_spotify_sub_user  ON spotify_submissions (added_by_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_spotify_sub_track ON spotify_submissions (track_id, removed);
