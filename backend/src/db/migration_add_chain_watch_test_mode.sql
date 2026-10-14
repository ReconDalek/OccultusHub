-- Lets a leader run the Live Chain view against simulated data instead of a
-- real Torn chain, so the countdown/urgent/hit-count UI can be exercised
-- without an actual chain running.
ALTER TABLE chain_watch_sessions ADD COLUMN is_test INTEGER DEFAULT 0;
