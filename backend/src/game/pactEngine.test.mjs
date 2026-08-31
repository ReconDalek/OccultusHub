// node --test src/db/... ;  run:  node --test backend/src/game/pactEngine.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyEffects, resolveChoice, resolveDelayed, rollDie, dieSeed, nightRollsDice,
  loyaltyMod, cashMod, computeScore, freshState, BANDS,
} from './pactEngine.js';
import { SEASONS, START, OFFERINGS_CAP } from './pactScenarios.js';

test('applyEffects — basic deltas', () => {
  const r = applyEffects({ gold: 1000, offerings: 0, dominion: 0, thralls: 0 },
    { gold: -300, dominion: 55 });
  assert.equal(r.state.gold, 700);
  assert.equal(r.state.dominion, 55);
  assert.equal(r.failed, false);
  assert.equal(r.broke, false);
});

test('applyEffects — dominion floors at 0 (affordable thrall cost)', () => {
  const r = applyEffects({ gold: 500, offerings: 0, dominion: 10, thralls: 3 },
    { dominion: -80, thralls: -3 });
  assert.equal(r.failed, false);
  assert.equal(r.state.dominion, 0);
  assert.equal(r.state.thralls, 0);
});

test('applyEffects — gold below 0 sets broke, does not floor', () => {
  const r = applyEffects({ gold: 100, offerings: 0, dominion: 0, thralls: 0 }, { gold: -400 });
  assert.equal(r.state.gold, -300);
  assert.equal(r.broke, true);
});

test('applyEffects — offerings overfill clamps to cap and applies penalty', () => {
  const r = applyEffects({ gold: 0, offerings: 80, dominion: 100, thralls: 5 }, { offerings: 30 });
  assert.equal(r.state.offerings, OFFERINGS_CAP);
  assert.equal(r.state.dominion, 20); // 100 - 80
  assert.equal(r.state.thralls, 2);   // 5 - 3
  assert.equal(r.overfilled, true);
});

test('applyEffects — unaffordable offerings/thralls cost => ritual fails, gold still lost', () => {
  const r = applyEffects({ gold: 500, offerings: 2, dominion: 100, thralls: 0 },
    { gold: -200, offerings: -10, dominion: 999 });
  assert.equal(r.failed, true);
  assert.equal(r.state.gold, 300);       // gold spent is lost
  assert.equal(r.state.offerings, 2);    // untouched
  assert.equal(r.state.dominion, 100);   // no reward
});

test('applyEffects — dominionPerThrall uses pre-delta thrall count', () => {
  const r = applyEffects({ gold: 1000, offerings: 0, dominion: 0, thralls: 10 },
    { gold: -150, dominion: 40, dominionPerThrall: 6, thralls: -1 });
  assert.equal(r.state.dominion, 40 + 6 * 10); // 100, not 6*9
  assert.equal(r.state.thralls, 9);
});

test('dice triples — band selects worst / mid / best', () => {
  const eff = { gold: [-400, -200, 100], dominion: [-30, 80, 200] };
  assert.equal(applyEffects(freshState(), eff, 0).deltas.gold, -400);
  assert.equal(applyEffects(freshState(), eff, 2).deltas.gold, 100);
  assert.equal(applyEffects({ ...freshState(), dominion: 50 }, eff, 1).state.dominion, 130);
});

test('rollDie — deterministic and band maps 1-2/3-4/5-6 -> 0/1/2', () => {
  const a = rollDie('s:1:13');
  const b = rollDie('s:1:13');
  assert.deepEqual(a, b);
  assert.ok(a.face >= 1 && a.face <= 6);
  assert.equal(a.band, Math.floor((a.face - 1) / 2));
  // spread across many seeds hits all three bands
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(rollDie(dieSeed('sess', i, 15)).band);
  assert.deepEqual([...seen].sort(), [0, 1, 2]);
});

test('nightRollsDice — 12 no, 13 yes', () => {
  assert.equal(nightRollsDice(12), false);
  assert.equal(nightRollsDice(13), true);
});

test('resolveChoice — fixed night ignores dice, dice night rolls', () => {
  const opt = { label: 'x', effects: { dominion: [10, 20, 30] } };
  const fixed = resolveChoice({ state: freshState(), night: 5, option: opt, sessionId: 's', cabalId: 1 });
  assert.equal(fixed.band, null);
  assert.equal(fixed.state.dominion, 20); // band 1 default

  const diced = resolveChoice({ state: freshState(), night: 15, option: opt, sessionId: 's', cabalId: 1 });
  assert.ok(BANDS.includes(diced.band));
});

test('resolveChoice — delayed payload queued with frozen band, resolves later', () => {
  const opt = { label: 'x', effects: { dominion: [5, 5, 5] }, delayed: { on: 17, effects: { dominion: [40, 110, 230] } } };
  const r = resolveChoice({ state: freshState(), night: 14, option: opt, sessionId: 's', cabalId: 7 });
  assert.equal(r.queued.on, 17);
  const later = resolveDelayed(r.state, r.queued);
  const expected = r.queued.effects.dominion[r.queued.band];
  assert.equal(later.state.dominion - r.state.dominion, expected);
});

test('score mods clamp', () => {
  assert.equal(loyaltyMod(0), 0.3);
  assert.equal(loyaltyMod(25), 1.3);
  assert.equal(loyaltyMod(1000), 2.0);
  assert.equal(cashMod(0), 0.75);
  assert.equal(cashMod(1000), 1.0);
  assert.equal(cashMod(999999), 1.5);
});

test('computeScore — formula and broke=0', () => {
  const s = { gold: 600, offerings: 0, dominion: 950, thralls: 12 };
  const { score } = computeScore(s);
  // 950 * (0.3 + 12/25=0.78) * (0.75 + 600/4000=0.9) * 10
  assert.equal(score, Math.round(950 * 0.78 * 0.9 * 10));
  assert.equal(computeScore({ ...s, gold: -1 }, { broke: true }).score, 0);
});

test('scenario data — 18 nights, 4 options each, triples only on dice nights', () => {
  const nights = SEASONS[1].nights;
  assert.equal(nights.length, 18);
  for (const n of nights) {
    assert.deepEqual(Object.keys(n.options).sort(), ['A', 'B', 'C', 'D']);
    for (const opt of Object.values(n.options)) {
      for (const [k, v] of Object.entries(opt.effects)) {
        if (Array.isArray(v)) {
          assert.equal(v.length, 3, `${n.night} ${k} triple`);
          assert.ok(n.night >= 13, `triple on fixed night ${n.night}`);
        }
      }
    }
  }
});

test('full deterministic run — never throws, produces a score or a break', () => {
  const path = { 1:'C',2:'B',3:'B',4:'C',5:'B',6:'A',7:'C',8:'B',9:'A',10:'B',11:'D',12:'B',
                 13:'C',14:'C',15:'B',16:'B',17:'D',18:'C' };
  let state = freshState();
  const pending = {};
  let broke = 0;
  for (const nd of SEASONS[1].nights) {
    for (const p of (pending[nd.night] || [])) {
      const r = resolveDelayed(state, p); state = r.state; if (r.broke) broke = nd.night;
    }
    if (broke) break;
    const opt = nd.options[path[nd.night]];
    const r = resolveChoice({ state, night: nd.night, option: opt, sessionId: 'test', cabalId: 1 });
    state = r.state;
    if (r.queued) (pending[r.queued.on] ||= []).push(r.queued);
    if (r.broke) { broke = nd.night; break; }
  }
  const { score } = computeScore(state, { broke: !!broke });
  assert.ok(Number.isFinite(score) && score >= 0);
});
