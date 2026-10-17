-- Chain Watch raffle: a leader picks a faction + time window, pulls every
-- watched hour slot in that window as a "ticket" (one per slot, so someone
-- who covered more hours has proportionally more chances), reviews any
-- slot that has a leader note (e.g. "late" vs "no-show") before it counts,
-- then runs one or more weighted random draws against the resulting pool.

-- One row per raffle session a leader sets up and runs.
CREATE TABLE IF NOT EXISTS chain_raffle_rounds (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  faction_id    INTEGER NOT NULL,
  period_start  INTEGER NOT NULL, -- unix seconds
  period_end    INTEGER NOT NULL, -- unix seconds
  draw_count    INTEGER NOT NULL DEFAULT 1, -- how many winners this round intends to draw
  status        TEXT NOT NULL DEFAULT 'building', -- 'building' -> 'ready' -> 'completed'
  created_by    INTEGER,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- One row per watched hour slot pulled into the round — the actual ticket
-- pool. A slot with no note is auto-included; a slot with a note needs a
-- leader decision before it counts (e.g. "late" might still count, "never
-- showed up" should not).
CREATE TABLE IF NOT EXISTS chain_raffle_entries (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id       INTEGER NOT NULL REFERENCES chain_raffle_rounds(id),
  torn_user_id   INTEGER NOT NULL,
  username       TEXT,
  slot_start     INTEGER NOT NULL,
  note           TEXT,
  review_status  TEXT NOT NULL DEFAULT 'auto', -- 'auto' (no note) | 'pending' (has a note, awaiting a leader decision) | 'included' | 'excluded'
  reviewed_by    INTEGER,
  reviewed_at    DATETIME
);
CREATE INDEX IF NOT EXISTS idx_chain_raffle_entries_round ON chain_raffle_entries(round_id);

-- One row per winner actually drawn.
CREATE TABLE IF NOT EXISTS chain_raffle_winners (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id            INTEGER NOT NULL REFERENCES chain_raffle_rounds(id),
  draw_number         INTEGER NOT NULL,
  torn_user_id        INTEGER NOT NULL,
  username            TEXT,
  winning_entry_id    INTEGER, -- which specific ticket/slot won, for audit
  removal_mode        TEXT NOT NULL, -- 'all_tickets' | 'single_ticket' — applied after this draw
  animation_style     TEXT, -- 'slot_machine' | 'wheel' | 'lotto_balls' — cosmetic, kept for history
  drawn_by            INTEGER,
  drawn_at            DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_chain_raffle_winners_round ON chain_raffle_winners(round_id);
