-- The Binding: remove the inactivity-dormancy feature.
-- Members away for work weeks were being locked out of their familiar and
-- charged shards to revive it. The feature itself is now gone from the code
-- (see bindingController.js). This one-off:
--   1. Fully revives anyone currently caught dormant (no partial, paid
--      revival like the old revival rite gave).
--   2. Credits every bound familiar a flat 500-shard goodwill refund — the
--      game kept no transaction log of past revival spend, so there's no
--      way to tell who actually paid; a flat refund to everyone is the
--      closest honest approximation.
UPDATE familiars
SET dormant = 0,
    dormant_at = NULL,
    happiness = 100,
    hp = max_hp,
    last_happiness_decay_at = CURRENT_TIMESTAMP
WHERE dormant = 1;

UPDATE familiars
SET shards = shards + 500;
