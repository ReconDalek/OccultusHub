-- Optional chain-length goal a leader can set when scheduling/starting a
-- Chain Watch session (2500/5000/10000/25000/50000/100000), so progress and
-- the historic time-to-reach estimate can be shown alongside it.
ALTER TABLE chain_watch_sessions ADD COLUMN target_length INTEGER;
