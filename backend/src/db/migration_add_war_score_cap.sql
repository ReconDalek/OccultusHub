-- Termed wars: leadership sometimes agrees a score target with the opponent
-- (e.g. "first to 11000") rather than fighting to Torn's real end condition.
-- score_cap lets stats/payout stop counting war_attack hits once our side's
-- cumulative respect first reaches this value, while everything else (defends,
-- armory, OD tracking, outside hits) still runs to the real war end. NULL =
-- uncapped (default, normal wars).
ALTER TABLE ranked_wars ADD COLUMN score_cap INTEGER;
