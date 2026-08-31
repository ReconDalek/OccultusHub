// The Pact — rules engine. Pure, deterministic, no I/O.
// The session controller and any future Discord client call nothing else.

import {
  START, OFFERINGS_CAP, OVERFILL_PENALTY, SCORE, DICE_FROM_NIGHT, TOTAL_NIGHTS,
} from './pactScenarios.js';

export { START, OFFERINGS_CAP, TOTAL_NIGHTS, DICE_FROM_NIGHT };

export const BANDS = ['ill-fortune', 'the-turning', 'favour'];
export const BAND_LABEL = {
  'ill-fortune': 'Ill Fortune',
  'the-turning': 'The Turning',
  'favour': 'Favour',
};

/** Nights 13–18 roll Fate's Dice. */
export function nightRollsDice(night) {
  return night >= DICE_FROM_NIGHT;
}

/**
 * Deterministic d6 for a cabal on a night. Returns { face:1..6, band:0|1|2 }.
 * FNV-1a over the seed string keeps it reproducible and auditable server-side.
 */
export function rollDie(seedStr) {
  let h = 0x811c9dc5;
  const s = String(seedStr);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const face = (h >>> 0) % 6 + 1;           // 1..6
  const band = Math.floor((face - 1) / 2);  // 1-2→0, 3-4→1, 5-6→2
  return { face, band };
}

export function dieSeed(sessionId, cabalId, night) {
  return `${sessionId}:${cabalId}:${night}`;
}

const RES = ['gold', 'offerings', 'dominion', 'thralls'];

function pick(value, band) {
  return Array.isArray(value) ? value[band] : (value || 0);
}

export function freshState() {
  return { ...START };
}

/**
 * Apply one option's effects to a state. Pure — returns a new state + a log.
 * @param {object} state   { gold, offerings, dominion, thralls }
 * @param {object} effects  option.effects (scalars or [w,m,b] triples)
 * @param {number} band     0|1|2 (ignored for fixed nights — pass 1)
 * @returns {{ state, deltas, failed, overfilled, broke }}
 */
export function applyEffects(state, effects, band = 1) {
  const s = { ...state };
  const before = { ...state };

  // ── affordability: a choice you can't cover in Offerings/Thralls fails ──
  const offCost = Math.max(0, -pick(effects.offerings, band));
  const thrCost = Math.max(0, -pick(effects.thralls, band));
  if (offCost > s.offerings || thrCost > s.thralls) {
    const goldCost = pick(effects.gold, band);
    if (goldCost < 0) s.gold += goldCost; // gold spent is still lost
    return {
      state: s,
      deltas: { gold: s.gold - before.gold, offerings: 0, dominion: 0, thralls: 0 },
      failed: true,
      overfilled: false,
      broke: s.gold < 0,
    };
  }

  // ── gold ──
  s.gold += pick(effects.gold, band);

  // ── dominion (flat + per-thrall, resolved against thralls BEFORE thrall delta) ──
  let dGain = pick(effects.dominion, band);
  if (effects.dominionPerThrall != null) {
    dGain += pick(effects.dominionPerThrall, band) * s.thralls;
  }
  s.dominion = Math.max(0, s.dominion + dGain);

  // ── thralls ──
  s.thralls = Math.max(0, s.thralls + pick(effects.thralls, band));

  // ── offerings + overfill penalty ──
  let overfilled = false;
  let off = s.offerings + pick(effects.offerings, band);
  if (off > OFFERINGS_CAP) {
    overfilled = true;
    off = OFFERINGS_CAP;
    s.dominion = Math.max(0, s.dominion + OVERFILL_PENALTY.dominion);
    s.thralls = Math.max(0, s.thralls + OVERFILL_PENALTY.thralls);
  }
  s.offerings = Math.max(0, off);

  const deltas = {};
  for (const r of RES) deltas[r] = s[r] - before[r];

  return { state: s, deltas, failed: false, overfilled, broke: s.gold < 0 };
}

/**
 * Resolve a committed choice for a cabal on a night.
 * @returns {{ state, deltas, band, face, failed, overfilled, broke, log }}
 */
export function resolveChoice({ state, night, option, sessionId, cabalId }) {
  const rolls = nightRollsDice(night);
  let band = 1, face = null;
  if (rolls) {
    const r = rollDie(dieSeed(sessionId, cabalId, night));
    band = r.band;
    face = r.face;
  }
  const res = applyEffects(state, option.effects, band);
  const parts = [];
  if (res.failed) parts.push('The ritual failed — nothing gained, the night spent.');
  if (res.overfilled) parts.push('The vault overflowed — the excess spoiled (−80 Dominion, −3 Thralls).');
  if (res.broke) parts.push('The Pact is Broken.');

  const queued = !res.failed && option.delayed
    ? { on: option.delayed.on, effects: option.delayed.effects, band }
    : null;

  return {
    state: res.state,
    deltas: res.deltas,
    band: rolls ? BANDS[band] : null,
    face,
    failed: res.failed,
    overfilled: res.overfilled,
    broke: res.broke,
    queued,
    log: parts.join(' '),
  };
}

/** Resolve a delayed payload at the start of its night. Band was frozen at queue time. */
export function resolveDelayed(state, payload) {
  return applyEffects(state, payload.effects, payload.band ?? 1);
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function loyaltyMod(thralls) {
  const c = SCORE.loyalty;
  return clamp(c.base + thralls * c.perThrall, c.min, c.max);
}
export function cashMod(gold) {
  const c = SCORE.cash;
  return clamp(c.base + gold * c.perGold, c.min, c.max);
}

/** Final score. A broken run scores 0. */
export function computeScore(state, { broke = false } = {}) {
  if (broke || state.gold < 0) {
    return { score: 0, loyaltyMod: loyaltyMod(state.thralls), cashMod: cashMod(Math.max(0, state.gold)) };
  }
  const lm = loyaltyMod(state.thralls);
  const cm = cashMod(state.gold);
  const score = Math.round(state.dominion * lm * cm * SCORE.DISPLAY_MULT);
  return { score, loyaltyMod: lm, cashMod: cm };
}
