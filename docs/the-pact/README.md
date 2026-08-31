# The Pact — design & playtest

An occult 18-night ritual / business-simulation game for the Games section
(alongside The Rite, The Sanctum, The Binding, Cards Against Occultus). **Design
phase — no game code exists yet.**

## Files

| File | What |
|---|---|
| [`design.html`](./design.html) | The full design doc (open in a browser). Scoring model, the playtested Season 1 night set, Fate's Dice, session/team rules, admin practice mode, two-phase build plan. Same content as the shared design artifact. |
| [`playtest/montecarlo.mjs`](./playtest/montecarlo.mjs) | Canonical balance sim — full 18 nights, 8,000 runs per strategy, reports bankruptcy rate and score percentiles. `node playtest/montecarlo.mjs` |
| [`playtest/simulate-nights-1-12.mjs`](./playtest/simulate-nights-1-12.mjs) | Earlier deterministic sim for nights 1–12 only (kept for reference). |

## Core model (v1 tuning targets — revise after a live playtest)

```
Score = Dominion × loyaltyMod × cashMod          (×10 for display)
  loyaltyMod = clamp(0.3 + Thralls / 25, 0.3, 2.0)
  cashMod    = clamp(0.75 + Gold / 4000, 0.75, 1.5)
```

- **Gold** starts at 1,000, is scarce, and < 0 on any night = *the Pact is Broken*.
- **Offerings** (cap 90) are ritual fuel, not scored; overfill = −80 Dominion / −3 Thralls.
- **Dominion** is the headline number every option chases.
- **Thralls** gate the score (no followers → keep 30% of Dominion) and power the
  four "rite with the faithful" options that grant `Dominion + Thralls × N`.
- Nights 13–18 add **Fate's Dice**: one d6 per cabal per night, `[worst, mid, best]`
  bands, costs swing modestly / rewards swing wide.

## Build order (see design.html §XII)

1. `backend/src/game/pactEngine.js` — pure module, unit-tested against the Monte-Carlo.
2. Session backend — migration + `/api/pact/session/*` + leaderboard + admin (incl. `POST /api/admin/pact/practice`).
3. Web frontend — `/pact` route, lobby / solo + team play / die-throw animation / Reckoning / boards. Mobile-first.
4. Season 1 live to the Order; retune.
5. Phase 2 — Discord command + host event screen.
