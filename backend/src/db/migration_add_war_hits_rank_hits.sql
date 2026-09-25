-- Rank credit must always be the member's actual attack count, capped only by
-- an ATTACK cap if leadership set one for that war's payout — never by a
-- respect cap or a respect-based payout figure (units/payout_amount stay
-- money-only). rank_hits is computed at Save-to-Rankings time; existing rows
-- predate this and have no cap info to recover, so they backfill to their raw
-- war_hits count (uncapped) — the same as any war with no cap set.
ALTER TABLE war_hits ADD COLUMN rank_hits INTEGER;
UPDATE war_hits SET rank_hits = war_hits WHERE rank_hits IS NULL;
