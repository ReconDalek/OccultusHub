-- Adds armory/energy tracking to saved chains, mirroring war tracking's
-- Energy In / Energy Repaid / OD columns (Energy Out is derived from
-- chain_hits.total_attacks * 25, no column needed).
-- Populated by a one-time check (chainController.js's fetchChainEnergyData)
-- run right after chain_hits is saved, or via the manual backfill endpoint
-- for chains saved before this feature existed.

ALTER TABLE chain_hits  ADD COLUMN xanax_used      INTEGER  NOT NULL DEFAULT 0;
ALTER TABLE chain_hits  ADD COLUMN xanax_deposited INTEGER  NOT NULL DEFAULT 0;
ALTER TABLE chain_hits  ADD COLUMN overdoses       INTEGER  NOT NULL DEFAULT 0;

-- Marks whether the one-time armory/energy check has run for this chain, so
-- the backfill button only touches chains that haven't been processed yet.
ALTER TABLE chain_cache ADD COLUMN energy_fetched_at DATETIME DEFAULT NULL;
