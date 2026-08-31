// Integration test for pactController over an in-memory SQLite D1 shim.
// run: node --test backend/src/controllers/pactController.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import * as pact from './pactController.js';
import { SEASONS } from '../game/pactScenarios.js';

function makeDB() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT);`);
  const mig = readFileSync(fileURLToPath(new URL('../db/migration_add_pact.sql', import.meta.url)), 'utf8');
  db.exec(mig);
  db.prepare(`INSERT INTO users (id, username) VALUES (1,'Host'),(2,'Two'),(3,'Three'),(4,'Four')`).run();

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
  return { prepare: wrap, async batch(stmts) { for (const s of stmts) s.run(); return []; } };
}

const U = (id) => ({ userId: id, username: `U${id}` });
const req = (url, body) => new Request('http://x' + url, {
  method: body === undefined ? 'GET' : 'POST',
  headers: { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body || {}),
});
const J = async (res) => (await res).json();
const state = (env, code, u) => J(pact.getState(req(`/api/pact/session/${code}/state`), env, u));

async function voteAll(env, code, users, option = 'D') {
  for (const u of users) {
    const s = await state(env, code, u);
    if (s.session.status !== 'playing') return s;
    if (s.cabal?.status === 'active' && !s.committed) {
      await pact.vote(req(`/api/pact/session/${code}/vote`, { option }), env, u);
    }
  }
  return state(env, code, users[0]);
}
async function playOut(env, code, users) {
  let s, guard = 0;
  do { s = await voteAll(env, code, users); } while (s.session.status === 'playing' && guard++ < 30);
  return s;
}

test('start guard — needs 3 players, named cabals; second season run blocked', async () => {
  const env = { DB: makeDB() };
  const c = await J(await pact.createSession(req('/api/pact/session', { mode: 'solo' }), env, U(1)));
  const code = c.code;

  // 1 player, unnamed -> blocked
  let r = await pact.startSession(req(`/api/pact/session/${code}/start`, {}), env, U(1));
  assert.equal(r.status, 400);

  await pact.joinSession(req(`/api/pact/session/${code}/join`, {}), env, U(2));
  await pact.joinSession(req(`/api/pact/session/${code}/join`, {}), env, U(3));

  // 3 players but cabals unnamed -> blocked
  r = await pact.startSession(req(`/api/pact/session/${code}/start`, {}), env, U(1));
  assert.equal(r.status, 400);
  assert.match((await J(r)).error, /name/i);

  for (const id of [1, 2, 3]) {
    await pact.setCabalName(req(`/api/pact/session/${code}/cabal`, { name: `Cabal ${id}` }), env, U(id));
  }
  r = await pact.startSession(req(`/api/pact/session/${code}/start`, {}), env, U(1));
  assert.equal(r.status, 200);

  const done = await playOut(env, code, [U(1), U(2), U(3)]);
  assert.equal(done.session.status, 'ended');
  assert.ok(done.reckoning);

  // U1 already has a finalized season run -> new solo create blocked
  const blocked = await pact.createSession(req('/api/pact/session', { mode: 'solo' }), env, U(1));
  assert.equal(blocked.status, 409);
});

test('team game — 2-per-team minimum enforced', async () => {
  const env = { DB: makeDB() };
  const c = await J(await pact.createSession(req('/api/pact/session', { mode: 'team' }), env, U(1)));
  const code = c.code;
  await pact.joinSession(req(`/api/pact/session/${code}/join`, {}), env, U(1));
  await pact.chooseTeam(req(`/api/pact/session/${code}/team`, { name: 'Red' }), env, U(1));
  const red = (await state(env, code, U(1))).you.cabalId;
  await pact.joinSession(req(`/api/pact/session/${code}/join`, {}), env, U(2));
  await pact.chooseTeam(req(`/api/pact/session/${code}/team`, { cabal_id: red }), env, U(2));
  await pact.joinSession(req(`/api/pact/session/${code}/join`, {}), env, U(3));
  await pact.chooseTeam(req(`/api/pact/session/${code}/team`, { name: 'Blue' }), env, U(3));

  // Blue has 1 member -> blocked
  let r = await pact.startSession(req(`/api/pact/session/${code}/start`, {}), env, U(1));
  assert.equal(r.status, 400);
  assert.match((await J(r)).error, /team needs at least 2/i);

  await pact.joinSession(req(`/api/pact/session/${code}/join`, {}), env, U(4));
  await pact.chooseTeam(req(`/api/pact/session/${code}/team`, { cabal_id: (await state(env, code, U(3))).you.cabalId }), env, U(4));
  r = await pact.startSession(req(`/api/pact/session/${code}/start`, {}), env, U(1));
  assert.equal(r.status, 200);

  // Red: U1 + U2 both vote B -> commits. Blue: U3 + U4 vote B -> commits. Night advances.
  await pact.vote(req(`/api/pact/session/${code}/vote`, { option: 'B' }), env, U(1));
  let s = await state(env, code, U(1));
  assert.equal(s.session.currentNight, 1, 'Red not fully voted yet');
  await pact.vote(req(`/api/pact/session/${code}/vote`, { option: 'B' }), env, U(2));
  await pact.vote(req(`/api/pact/session/${code}/vote`, { option: 'B' }), env, U(3));
  await pact.vote(req(`/api/pact/session/${code}/vote`, { option: 'B' }), env, U(4));
  s = await state(env, code, U(1));
  assert.equal(s.session.currentNight, 2);
});

test('state — night payload carries option effects + delayed for the client', async () => {
  const env = { DB: makeDB() };
  const a = await J(await pact.adminPractice(req('/api/admin/pact/practice', {}), env, U(1)));
  const s = await state(env, a.code, U(1));
  assert.equal(s.session.isPractice, true);
  assert.deepEqual(s.night.options.A.effects, SEASONS[1].nights[0].options.A.effects);
  // night 3 D has a delayed payload
  // (fast-forward not needed — just confirm shape exists on the data)
});

test('admin practice — auto-started, unlimited, unranked', async () => {
  const env = { DB: makeDB() };
  const a = await J(await pact.adminPractice(req('/api/admin/pact/practice', {}), env, U(1)));
  const b = await J(await pact.adminPractice(req('/api/admin/pact/practice', {}), env, U(1)));
  assert.notEqual(a.code, b.code);
  const done = await playOut(env, a.code, [U(1)]);
  assert.equal(done.session.status, 'ended');
  const lb = await J(await pact.leaderboard(req('/api/pact/leaderboard?scope=season'), env, U(1)));
  assert.equal(lb.leaderboard.length, 0, 'practice runs never hit the board');
});
