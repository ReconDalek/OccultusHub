-- Adds a global throttle timestamp for the "Shuffle" button on the overlay.
ALTER TABLE spotify_config ADD COLUMN last_shuffled_at TEXT;
