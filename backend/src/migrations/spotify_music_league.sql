-- Secondary listen-only player for Music League rounds (a fresh public
-- playlist each round). No jukebox token, no adding — admin just pastes the
-- round's playlist. See spotifyController.js / MusicTab.jsx.
ALTER TABLE spotify_config ADD COLUMN ml_enabled     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE spotify_config ADD COLUMN ml_playlist_id TEXT;
ALTER TABLE spotify_config ADD COLUMN ml_label       TEXT;
