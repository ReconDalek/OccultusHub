-- War Economics: frozen profit/expense snapshot per war, written once at
-- payout finalisation (saveWarHits) so item_prices_cache drift never changes
-- a historic war's figures after the fact.
ALTER TABLE ranked_wars ADD COLUMN economics_json TEXT;
