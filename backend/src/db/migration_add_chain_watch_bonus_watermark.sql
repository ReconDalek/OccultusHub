-- The live bonus-hit detector originally scanned a fixed window of recent
-- attacks (3 pages back from "now") every check. That works fine right
-- after a threshold is crossed, but once a chain runs long enough that
-- nobody happens to poll for a while, the attack that actually landed an
-- earlier threshold falls out of that fixed window permanently (confirmed
-- live: a chain at position 14734 could no longer find position 250-10000,
-- all hours in the past). A per-session watermark lets each check only
-- scan the (usually tiny) gap since the last one, instead of re-scanning
-- the same recent window from scratch every time.
ALTER TABLE chain_watch_sessions ADD COLUMN bonus_watermark_attack_id INTEGER;
