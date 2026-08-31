// Integration test for pactController over an in-memory SQLite D1 shim.
// run: node --test backend/src/controllers/pactController.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import * as pact from './pactController.js';
import { SEASONS } from '../game/pactScenarios.js';

// ── minimal D1 shim over node:sqlite ─────────────────────────────────────
function makeDB() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT);`);
  const mig = readFileSync(fileURLToPath(new URL('../db/migration_add_pact.sql', import.meta.url)), 'utf8');
  db.exec(mig);
  db.prepare(`INSERT INTO users (id, username) VALUES (1,'Host'),(2,'Two'),(3,'Three')`).run();

  const wrap = (sql) => ({
    _args: [],
    bind(...a) { this._args = a; return this; },
    first() { return db.prepare(sql).get(...this._args) ?? null; },
    all() { return { results: db.prepare(sql).all(...this._args) }; },
    run() {
      const r = db.prepare(sql).run(...this._args);
      return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } };
    },
  });
  return {
    prepare: wrap,
    async batch(stmts) { for (const s of stmts) s.run(); return []; },
  };
}

const req = (url, body) => new Request('http://x' + url, {
  method: body === undefined ? 'GET' : 'POST',
  headers: { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body || {}),
});
const J = (res) => res.json();

test('solo game — create, start, play 18 nights, reach a Reckoning', async () => {
  const env = { DB: makeDB() };
  const host = { userId: 1, username: 'Host' };

  const created = await J(await pact.createSession(req('/api/pact/session', { mode: 'solo' }), env, host));
  const code = created.code;
  assert.match(code, /^[A-Z0-9]{6}$/);

  await pact.startSession(req(`/api/pact/session/${code}/start`, {}), env, host);

  let state = await J(await pact.getState(req(`/api/pact/session/${code}/state`), env, host));
  assert.equal(state.session.status, 'playing');
  assert.equal(state.session.currentNight, 1);
  assert.ok(state.night, 'night payload present');
  assert.equal(state.night.options.A.label, SEASONS[1].nights[0].options.A.label);
  assert.ok(!('effects' in state.night.options.A), 'no effects leaked to client');

  let guard = 0;
  while (state.session.status === 'playing' && guard++ < 40) {
    if (state.cabal.status !== 'active') break;
    const pickOrder = ['B', 'D', 'A', 'C']; // B-lean survives longer than A-spam
    const choice = pickOrder.find((o) => state.night?.options[o]) || 'D';
    state = await J(await pact.vote(req(`/api/pact/session/${code}/vote`, { option: choice }), env, host));
  }

  assert.equal(state.session.status, 'ended', 'game ended');
  assert.ok(state.reckoning, 'reckoning present');
  assert.ok(Number.isFinite(state.reckoning.score) && state.reckoning.score >= 0);
  assert.ok(Array.isArray(state.standings) && state.standings.length === 1);
  const ledgerNights = state.cabal.ledger.filter((l) => !l.delayed).map((l) => l.night);
  assert.ok(ledgerNights.length >= 1);
});

test('one run per season — second solo create is blocked', async () => {
  const env = { DB: makeDB() };
  const host = { userId: 1, username: 'Host' };
  const c1 = await J(await pact.createSession(req('/api/pact/session', { mode: 'solo' }), env, host));
  await pact.startSession(req(`/api/pact/session/${c1.code}/start`, {}), env, host);
  let s = await J(await pact.getState(req(`/api/pact/session/${c1.code}/state`), env, host));
  let guard = 0;
  while (s.session.status === 'playing' && guard++ < 40) {
    if (s.cabal.status !== 'active') break;
    s = await J(await pact.vote(req(`/api/pact/session/${c1.code}/vote`, { option: 'D' }), env, host));
  }
  const res = await pact.createSession(req('/api/pact/session', { mode: 'solo' }), env, host);
  assert.equal(res.status, 409);
});

test('team game — two teams, votes resolve, night advances when all commit', async () => {
  const env = { DB: makeDB() };
  const host = { userId: 1, username: 'Host' };
  const p2 = { userId: 2, username: 'Two' };
  const p3 = { userId: 3, username: 'Three' };

  const c = await J(await pact.createSession(req('/api/pact/session', { mode: 'team' }), env, host));
  const code = c.code;
  await pact.joinSession(req(`/api/pact/session/${code}/join`, {}), env, host);
  await pact.chooseTeam(req(`/api/pact/session/${code}/team`, { name: 'Red' }), env, host);
  const redState = await J(await pact.getState(req(`/api/pact/session/${code}/state`), env, host));
  const redId = redState.you.cabalId;

  await pact.joinSession(req(`/api/pact/session/${code}/join`, {}), env, p2);
  await pact.chooseTeam(req(`/api/pact/session/${code}/team`, { cabal_id: redId }), env, p2); // join Red
  await pact.joinSession(req(`/api/pact/session/${code}/join`, {}), env, p3);
  await pact.chooseTeam(req(`/api/pact/session/${code}/team`, { name: 'Blue' }), env, p3);

  await pact.startSession(req(`/api/pact/session/${code}/start`, {}), env, host);

  // Red: host votes B, p2 votes B -> commits. Blue: p3 votes B -> commits. Night advances.
  await pact.vote(req(`/api/pact/session/${code}/vote`, { option: 'B' }), env, host);
  let s = await J(await pact.getState(req(`/api/pact/session/${code}/state`), env, host));
  assert.equal(s.session.currentNight, 1, 'still night 1 — Red not fully voted');
  await pact.vote(req(`/api/pact/session/${code}/vote`, { option: 'B' }), env, p2);
  await pact.vote(req(`/api/pact/session/${code}/vote`, { option: 'C' }), env, p3);
  s = await J(await pact.getState(req(`/api/pact/session/${code}/state`), env, host));
  assert.equal(s.session.currentNight, 2, 'advanced to night 2');
});

test('admin practice — unlimited, never blocked, is_practice flagged', async () => {
  const env = { DB: makeDB() };
  const admin = { userId: 1, username: 'Admin' };
  const a = await J(await pact.adminPractice(req('/api/admin/pact/practice', {}), env, admin));
  assert.equal(a.practice, true);
  const b = await J(await pact.adminPractice(req('/api/admin/pact/practice', {}), env, admin));
  assert.notEqual(a.code, b.code);
  const st = await J(await pact.getState(req(`/api/pact/session/${a.code}/state`), env, admin));
  assert.equal(st.session.isPractice, true);
  assert.equal(st.session.status, 'playing');
});
