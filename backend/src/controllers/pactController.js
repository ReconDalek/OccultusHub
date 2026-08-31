import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import {
  SEASONS, ACTIVE_SEASON, HOLD_OPTION, TOTAL_NIGHTS, getSeason, getNight,
} from '../game/pactScenarios.js';
import {
  resolveChoice, resolveDelayed, computeScore, nightRollsDice, rollDie, dieSeed,
} from '../game/pactEngine.js';

// ── helpers ──────────────────────────────────────────────────────────────
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function genCode() {
  let c = '';
  for (let i = 0; i < 6; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return c;
}
const OPTS = ['A', 'B', 'C', 'D'];
const TIMERS = [0, 90, 120, 180];

function codeFromUrl(request) {
  const m = new URL(request.url).pathname.match(/\/api\/pact\/session\/([A-Za-z0-9]{6})/);
  return m ? m[1].toUpperCase() : null;
}

const cabalResources = (row) => ({
  gold: row.gold, offerings: row.offerings, dominion: row.dominion, thralls: row.thralls,
});

const BAND_KEYS = ['ill-fortune', 'the-turning', 'favour'];
const pickBand = (v, b) => (Array.isArray(v) ? v[b] : (v ?? 0));

// The face value of an option on a given band, resolved against the cabal's
// current Thralls (for dominionPerThrall). Not state-clamped — this is "what the
// pact offers", the arithmetic against your own books is still yours to do.
function optionOffer(effects, band, thralls) {
  let dominion = pickBand(effects.dominion, band);
  if (effects.dominionPerThrall != null) dominion += pickBand(effects.dominionPerThrall, band) * thralls;
  return {
    gold: pickBand(effects.gold, band),
    offerings: pickBand(effects.offerings, band),
    dominion,
    thralls: pickBand(effects.thralls, band),
  };
}

function nightForClient(seasonId, night, thralls = 0) {
  const n = getNight(seasonId, night);
  if (!n) return null;
  const dice = nightRollsDice(n.night);
  const options = {};
  for (const k of OPTS) {
    const o = n.options[k];
    const opt = { label: o.label };
    if (dice) {
      opt.outcomes = BAND_KEYS.map((key, b) => ({ band: key, ...optionOffer(o.effects, b, thralls) }));
    } else {
      opt.outcome = optionOffer(o.effects, 1, thralls);
    }
    if (o.delayed) {
      opt.delayed = {
        on: o.delayed.on,
        outcomes: dice
          ? BAND_KEYS.map((key, b) => ({ band: key, ...optionOffer(o.delayed.effects, b, thralls) }))
          : [{ band: null, ...optionOffer(o.delayed.effects, 1, thralls) }],
      };
    }
    options[k] = opt;
  }
  return {
    night: n.night, title: n.title, body: n.body, options,
    rollsDice: dice, holdOption: HOLD_OPTION[n.night],
  };
}

async function getSession(env, code) {
  return env.DB.prepare('SELECT * FROM pact_sessions WHERE code = ?').bind(code.toUpperCase()).first();
}
async function getCabals(env, sessionId) {
  return (await env.DB.prepare('SELECT * FROM pact_cabals WHERE session_id = ? ORDER BY id').bind(sessionId).all()).results || [];
}
async function getMyMembership(env, sessionId, userId) {
  return env.DB.prepare(
    `SELECT m.* FROM pact_cabal_members m JOIN pact_cabals c ON c.id = m.cabal_id
     WHERE c.session_id = ? AND m.user_id = ?`
  ).bind(sessionId, userId).first();
}
function liveCabals(cabals) {
  return cabals.filter((c) => c.status === 'active');
}

async function hasSeasonRun(env, userId, seasonId) {
  const row = await env.DB.prepare(
    `SELECT 1 FROM pact_cabal_members m
       JOIN pact_cabals c   ON c.id = m.cabal_id
       JOIN pact_sessions s ON s.id = c.session_id
      WHERE m.user_id = ? AND s.season_id = ? AND s.is_practice = 0
        AND c.final_score IS NOT NULL LIMIT 1`
  ).bind(userId, seasonId).first();
  return !!row;
}

// ── session lifecycle ────────────────────────────────────────────────────
export async function createSession(request, env, user) {
  const body = await request.json().catch(() => ({}));
  const mode = body.mode === 'team' ? 'team' : 'solo';
  const timer = TIMERS.includes(body.timer_seconds) ? body.timer_seconds : 0;

  if (mode === 'solo' && await hasSeasonRun(env, user.userId, ACTIVE_SEASON)) {
    return errorResponse('You have already played The Pact this season.', 409);
  }

  let code, tries = 0;
  do { code = genCode(); tries++; } while (await getSession(env, code) && tries < 8);

  const res = await env.DB.prepare(
    `INSERT INTO pact_sessions (code, season_id, host_user_id, mode, timer_seconds)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(code, ACTIVE_SEASON, user.userId, mode, timer).run();
  const sessionId = res.meta.last_row_id;

  if (mode === 'solo') {
    await createCabal(env, sessionId, user, '');
  }
  return jsonResponse({ code, mode, timer_seconds: timer });
}

async function createCabal(env, sessionId, user, name) {
  const c = await env.DB.prepare(
    `INSERT INTO pact_cabals (session_id, name) VALUES (?, ?)`
  ).bind(sessionId, name).run();
  const cabalId = c.meta.last_row_id;
  await env.DB.prepare(
    `INSERT INTO pact_cabal_members (cabal_id, user_id) VALUES (?, ?)`
  ).bind(cabalId, user.userId).run();
  return cabalId;
}

export async function joinSession(request, env, user) {
  const code = codeFromUrl(request);
  const session = await getSession(env, code);
  if (!session) return errorResponse('No such session', 404);
  if (session.status !== 'lobby') return errorResponse('That game has already started', 409);

  const existing = await getMyMembership(env, session.id, user.userId);
  if (existing) return jsonResponse({ code: session.code, joined: true });

  if (session.mode === 'solo') {
    if (await hasSeasonRun(env, user.userId, ACTIVE_SEASON) && !session.is_practice) {
      return errorResponse('You have already played The Pact this season.', 409);
    }
    await createCabal(env, session.id, user, '');
  }
  // team mode: user joins the session but picks/creates a team next
  return jsonResponse({ code: session.code, joined: true, needsTeam: session.mode === 'team' });
}

export async function chooseTeam(request, env, user) {
  const code = codeFromUrl(request);
  const body = await request.json().catch(() => ({}));
  const session = await getSession(env, code);
  if (!session || session.mode !== 'team') return errorResponse('Not a team game', 400);
  if (session.status !== 'lobby') return errorResponse('That game has already started', 409);

  const mine = await getMyMembership(env, session.id, user.userId);
  if (mine) await env.DB.prepare('DELETE FROM pact_cabal_members WHERE id = ?').bind(mine.id).run();

  let cabalId = body.cabal_id;
  if (cabalId) {
    const target = await env.DB.prepare('SELECT * FROM pact_cabals WHERE id = ? AND session_id = ?')
      .bind(cabalId, session.id).first();
    if (!target) return errorResponse('No such team', 404);
    const count = await env.DB.prepare('SELECT COUNT(*) n FROM pact_cabal_members WHERE cabal_id = ?').bind(cabalId).first();
    if (count.n >= 4) return errorResponse('That team is full (4)', 409);
    await env.DB.prepare('INSERT INTO pact_cabal_members (cabal_id, user_id) VALUES (?, ?)').bind(cabalId, user.userId).run();
  } else {
    const name = String(body.name || '').trim().slice(0, 40);
    cabalId = await createCabal(env, session.id, user, name);
  }
  // clean up teams left empty
  await env.DB.prepare(
    `DELETE FROM pact_cabals WHERE session_id = ? AND id NOT IN (SELECT cabal_id FROM pact_cabal_members)`
  ).bind(session.id).run();
  return jsonResponse({ cabal_id: cabalId });
}

export async function setCabalName(request, env, user) {
  const code = codeFromUrl(request);
  const session = await getSession(env, code);
  if (!session) return errorResponse('No such session', 404);
  // practice runs auto-start, so allow renaming any time before they end
  if (session.status === 'ended' || (session.status !== 'lobby' && !session.is_practice)) {
    return errorResponse('Too late to rename the cabal', 409);
  }
  const mem = await getMyMembership(env, session.id, user.userId);
  if (!mem) return errorResponse('You are not in this game', 403);
  const name = String((await request.json().catch(() => ({}))).name || '').trim().slice(0, 40);
  if (!name) return errorResponse('Give your cabal a name', 400);
  await env.DB.prepare('UPDATE pact_cabals SET name = ? WHERE id = ?').bind(name, mem.cabal_id).run();
  return jsonResponse({ name });
}

export async function startSession(request, env, user) {
  const code = codeFromUrl(request);
  const session = await getSession(env, code);
  if (!session) return errorResponse('No such session', 404);
  if (session.host_user_id !== user.userId) return errorResponse('Only the host can start', 403);
  if (session.status !== 'lobby') return errorResponse('Already started', 409);

  const cabals = await getCabals(env, session.id);
  if (cabals.length === 0) return errorResponse('No cabals to start', 400);

  if (!session.is_practice) {
    const rows = (await env.DB.prepare(
      `SELECT cabal_id, COUNT(*) n FROM pact_cabal_members
        WHERE cabal_id IN (SELECT id FROM pact_cabals WHERE session_id = ?) GROUP BY cabal_id`
    ).bind(session.id).all()).results || [];
    const counts = Object.fromEntries(rows.map((r) => [r.cabal_id, r.n]));
    const players = Object.values(counts).reduce((a, b) => a + b, 0);

    if (players < 3) return errorResponse('The Order needs at least 3 members in the lobby to begin.', 400);
    if (cabals.some((c) => !String(c.name || '').trim())) {
      return errorResponse('Every cabal must choose a name before the rite begins.', 400);
    }
    if (session.mode === 'team' && cabals.some((c) => (counts[c.id] || 0) < 2)) {
      return errorResponse('Every team needs at least 2 members.', 400);
    }
  }

  const ends = session.timer_seconds > 0
    ? new Date(Date.now() + session.timer_seconds * 1000).toISOString().replace('T', ' ').replace('Z', '')
    : null;
  await env.DB.prepare(
    `UPDATE pact_sessions SET status = 'playing', current_night = 1, night_ends_at = ? WHERE id = ?`
  ).bind(ends, session.id).run();
  return jsonResponse({ started: true });
}

// ── tick: timer expiry + night advancement ───────────────────────────────
async function committedCabalIds(env, sessionId, night) {
  const rows = await env.DB.prepare(
    `SELECT DISTINCT cm.cabal_id FROM pact_commits cm
       JOIN pact_cabals c ON c.id = cm.cabal_id
      WHERE c.session_id = ? AND cm.night = ?`
  ).bind(sessionId, night).all();
  return new Set((rows.results || []).map((r) => r.cabal_id));
}

async function applyCommit(env, session, cabal, option, auto = false) {
  const nightDef = getNight(session.season_id, session.current_night);
  const opt = nightDef.options[option];
  const r = resolveChoice({
    state: cabalResources(cabal), night: session.current_night, option: opt,
    sessionId: session.id, cabalId: cabal.id,
  });

  const ledger = JSON.parse(cabal.ledger || '[]');
  ledger.push({
    night: session.current_night, title: nightDef.title, option, label: opt.label,
    band: r.band, face: r.face, deltas: r.deltas, failed: r.failed,
    overfilled: r.overfilled, broke: r.broke, note: r.log,
  });
  const pending = JSON.parse(cabal.pending || '{}');
  if (r.queued) (pending[r.queued.on] ||= []).push({ effects: r.queued.effects, band: r.queued.band });

  const brokeNight = r.broke ? session.current_night : cabal.broke_on_night;
  await env.DB.prepare(
    `UPDATE pact_cabals SET gold=?, offerings=?, dominion=?, thralls=?, ledger=?, pending=?,
       status = CASE WHEN ? THEN 'broken' ELSE status END, broke_on_night = ?
     WHERE id = ?`
  ).bind(r.state.gold, r.state.offerings, r.state.dominion, r.state.thralls,
    JSON.stringify(ledger), JSON.stringify(pending), r.broke ? 1 : 0, brokeNight, cabal.id).run();

  await env.DB.prepare(
    `INSERT OR IGNORE INTO pact_commits (cabal_id, night, option, band, face, deltas, auto)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(cabal.id, session.current_night, option, r.band, r.face, JSON.stringify(r.deltas), auto ? 1 : 0).run();

  await env.DB.prepare('DELETE FROM pact_votes WHERE cabal_id = ? AND night = ?')
    .bind(cabal.id, session.current_night).run();
}

async function advanceIfReady(env, session) {
  let cabals = await getCabals(env, session.id);
  const live = liveCabals(cabals);
  if (live.length === 0) return finalize(env, session, cabals);

  const done = await committedCabalIds(env, session.id, session.current_night);
  const allIn = live.every((c) => done.has(c.id));
  if (!allIn) return null;

  const next = session.current_night + 1;
  if (next > TOTAL_NIGHTS) return finalize(env, session, cabals);

  // resolve delayed payloads landing on `next`
  cabals = await getCabals(env, session.id);
  for (const c of cabals) {
    if (c.status !== 'active') continue;
    const pending = JSON.parse(c.pending || '{}');
    const payloads = pending[next] || [];
    if (!payloads.length) continue;
    let st = cabalResources(c);
    const ledger = JSON.parse(c.ledger || '[]');
    let broke = false;
    for (const p of payloads) {
      const rr = resolveDelayed(st, p);
      st = rr.state;
      ledger.push({ night: next, delayed: true, deltas: rr.deltas, broke: rr.broke, overfilled: rr.overfilled });
      if (rr.broke) broke = true;
    }
    delete pending[next];
    await env.DB.prepare(
      `UPDATE pact_cabals SET gold=?, offerings=?, dominion=?, thralls=?, ledger=?, pending=?,
         status = CASE WHEN ? THEN 'broken' ELSE status END, broke_on_night = CASE WHEN ? THEN ? ELSE broke_on_night END
       WHERE id = ?`
    ).bind(st.gold, st.offerings, st.dominion, st.thralls, JSON.stringify(ledger), JSON.stringify(pending),
      broke ? 1 : 0, broke ? 1 : 0, next, c.id).run();
  }

  const ends = session.timer_seconds > 0
    ? new Date(Date.now() + session.timer_seconds * 1000).toISOString().replace('T', ' ').replace('Z', '')
    : null;
  await env.DB.prepare(
    `UPDATE pact_sessions SET current_night = ?, night_ends_at = ? WHERE id = ?`
  ).bind(next, ends, session.id).run();
  session.current_night = next;
  session.night_ends_at = ends;

  // a fresh timer night could still auto-resolve if everyone is gone; re-check once
  const after = await getSession(env, session.code);
  return advanceIfReady(env, after);
}

async function finalize(env, session, cabals) {
  for (const c of cabals) {
    if (c.final_score != null) continue;
    const broke = c.status === 'broken';
    const { score, loyaltyMod, cashMod } = computeScore(cabalResources(c), { broke });
    await env.DB.prepare(
      `UPDATE pact_cabals SET final_score = ?, loyalty_mod = ?, cash_mod = ?,
         status = CASE WHEN status = 'broken' THEN 'broken' WHEN status = 'abandoned' THEN 'abandoned' ELSE 'won' END
       WHERE id = ?`
    ).bind(score, loyaltyMod, cashMod, c.id).run();
  }
  await env.DB.prepare(
    `UPDATE pact_sessions SET status = 'ended', ended_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(session.id).run();
  return true;
}

async function tick(env, session) {
  if (session.status !== 'playing') return session;

  // timer expiry → auto-commit non-committed live cabals with the hold option
  if (session.timer_seconds > 0 && session.night_ends_at) {
    const ends = new Date(session.night_ends_at.replace(' ', 'T') + 'Z').getTime();
    if (Date.now() >= ends) {
      const cabals = liveCabals(await getCabals(env, session.id));
      const done = await committedCabalIds(env, session.id, session.current_night);
      for (const c of cabals) {
        if (!done.has(c.id)) await applyCommit(env, session, c, HOLD_OPTION[session.current_night], true);
      }
    }
  }
  await advanceIfReady(env, session);
  return getSession(env, session.code);
}

// ── team vote resolution ─────────────────────────────────────────────────
function tallyWinner(votes, seedStr) {
  const counts = {};
  for (const v of votes) counts[v.option] = (counts[v.option] || 0) + 1;
  const max = Math.max(...Object.values(counts));
  const top = Object.keys(counts).filter((k) => counts[k] === max).sort();
  if (top.length === 1) return top[0];
  return top[rollDie(seedStr).face % top.length]; // Fate breaks the tie
}

// ── play ─────────────────────────────────────────────────────────────────
export async function vote(request, env, user) {
  const code = codeFromUrl(request);
  let session = await getSession(env, code);
  if (!session) return errorResponse('No such session', 404);
  session = await tick(env, session);
  if (session.status !== 'playing') return getState(request, env, user);

  const body = await request.json().catch(() => ({}));
  const option = body.option;
  if (!OPTS.includes(option)) return errorResponse('Pick A, B, C or D', 400);

  const mem = await getMyMembership(env, session.id, user.userId);
  if (!mem) return errorResponse('You are not in this game', 403);
  const cabal = await env.DB.prepare('SELECT * FROM pact_cabals WHERE id = ?').bind(mem.cabal_id).first();
  if (cabal.status !== 'active') return errorResponse('Your cabal is out of the game', 409);

  const already = await committedCabalIds(env, session.id, session.current_night);
  if (already.has(cabal.id)) return errorResponse('Your cabal has already committed tonight', 409);

  await env.DB.prepare(
    `INSERT INTO pact_votes (cabal_id, night, user_id, option) VALUES (?, ?, ?, ?)
     ON CONFLICT(cabal_id, night, user_id) DO UPDATE SET option = excluded.option`
  ).bind(cabal.id, session.current_night, user.userId, option).run();

  const members = (await env.DB.prepare(
    `SELECT * FROM pact_cabal_members WHERE cabal_id = ? AND status = 'active'`
  ).bind(cabal.id).all()).results || [];
  const votes = (await env.DB.prepare(
    `SELECT * FROM pact_votes WHERE cabal_id = ? AND night = ?`
  ).bind(cabal.id, session.current_night).all()).results || [];

  if (votes.length >= members.length) {
    const winner = tallyWinner(votes, dieSeed(session.id, cabal.id, session.current_night) + ':tie');
    await applyCommit(env, session, cabal, winner);
    session = await tick(env, session);
  }
  return getState(request, env, user);
}

export async function rejoin(request, env, user) {
  const code = codeFromUrl(request);
  const session = await getSession(env, code);
  if (!session) return errorResponse('No such session', 404);
  const mem = await getMyMembership(env, session.id, user.userId);
  if (!mem) return errorResponse('You are not in this game', 403);
  if (mem.status === 'gave_up') {
    await env.DB.prepare(`UPDATE pact_cabal_members SET status = 'active' WHERE id = ?`).bind(mem.id).run();
  }
  return getState(request, env, user);
}

// ── state ────────────────────────────────────────────────────────────────
export async function getState(request, env, user) {
  const code = codeFromUrl(request);
  let session = await getSession(env, code);
  if (!session) return errorResponse('No such session', 404);
  session = await tick(env, session);

  const cabals = await getCabals(env, session.id);
  const mem = await getMyMembership(env, session.id, user.userId);
  const myCabal = mem ? cabals.find((c) => c.id === mem.cabal_id) : null;

  const out = {
    session: {
      code: session.code, mode: session.mode, status: session.status,
      currentNight: session.current_night, totalNights: TOTAL_NIGHTS,
      timerSeconds: session.timer_seconds, nightEndsAt: session.night_ends_at,
      isPractice: !!session.is_practice, isHost: session.host_user_id === user.userId,
      season: getSeason(session.season_id)?.name,
      setting: getSeason(session.season_id)?.setting,
    },
    cabals: cabals.map((c) => ({
      id: c.id, name: c.name, status: c.status,
      members: undefined, // filled below for lobby
    })),
    you: mem ? { cabalId: mem.cabal_id, memberStatus: mem.status } : null,
  };

  if (session.status === 'lobby') {
    for (const c of out.cabals) {
      const ms = (await env.DB.prepare(
        `SELECT user_id FROM pact_cabal_members WHERE cabal_id = ?`
      ).bind(c.id).all()).results || [];
      c.members = ms.map((m) => m.user_id);
    }
    return jsonResponse(out);
  }

  // playing / ended
  const done = await committedCabalIds(env, session.id, session.current_night);
  const live = liveCabals(cabals);
  out.progress = { committed: live.filter((c) => done.has(c.id)).length, total: live.length };

  if (myCabal) {
    out.cabal = {
      name: myCabal.name, status: myCabal.status,
      gold: myCabal.gold, offerings: myCabal.offerings,
      dominion: myCabal.dominion, thralls: myCabal.thralls,
      ledger: JSON.parse(myCabal.ledger || '[]'),
    };
    out.committed = done.has(myCabal.id);

    if (session.status === 'playing' && myCabal.status === 'active' && !out.committed) {
      out.night = nightForClient(session.season_id, session.current_night, myCabal.thralls);
      const v = await env.DB.prepare(
        `SELECT option FROM pact_votes WHERE cabal_id = ? AND night = ? AND user_id = ?`
      ).bind(myCabal.id, session.current_night, user.userId).first();
      out.yourVote = v?.option || null;
      if (session.mode === 'team') {
        const vs = (await env.DB.prepare(
          `SELECT option, COUNT(*) n FROM pact_votes WHERE cabal_id = ? AND night = ? GROUP BY option`
        ).bind(myCabal.id, session.current_night).all()).results || [];
        out.votes = Object.fromEntries(vs.map((r) => [r.option, r.n]));
      }
    }
    if (myCabal.final_score != null) {
      out.reckoning = {
        score: myCabal.final_score, loyaltyMod: myCabal.loyalty_mod, cashMod: myCabal.cash_mod,
        dominion: myCabal.dominion, thralls: myCabal.thralls, gold: myCabal.gold,
        status: myCabal.status, brokeOnNight: myCabal.broke_on_night,
      };
    }
  }

  if (session.status === 'ended') {
    out.standings = [];
    for (const c of [...cabals].sort((a, b) => (b.final_score ?? 0) - (a.final_score ?? 0))) {
      out.standings.push({
        name: c.name, score: c.final_score ?? 0, status: c.status,
        brokeOnNight: c.broke_on_night, members: await cabalMembers(env, c.id),
      });
    }
  }
  return jsonResponse(out);
}

async function cabalMembers(env, cabalId) {
  const rows = (await env.DB.prepare(
    `SELECT u.username FROM pact_cabal_members m JOIN users u ON u.id = m.user_id
      WHERE m.cabal_id = ? ORDER BY m.joined_at`
  ).bind(cabalId).all()).results || [];
  return rows.map((r) => r.username);
}

// ── leaderboards ─────────────────────────────────────────────────────────
export async function leaderboard(request, env, user) {
  const url = new URL(request.url);
  const scope = url.searchParams.get('scope') === 'alltime' ? 'alltime' : 'season';

  let sql = `
    SELECT c.id, c.name, c.final_score AS score, s.season_id, c.status, c.broke_on_night
      FROM pact_cabals c
      JOIN pact_sessions s ON s.id = c.session_id
     WHERE s.is_practice = 0 AND c.final_score IS NOT NULL`;
  const binds = [];
  if (scope === 'season') { sql += ' AND s.season_id = ?'; binds.push(ACTIVE_SEASON); }
  sql += ' ORDER BY score DESC LIMIT 50';

  const cabals = (await env.DB.prepare(sql).bind(...binds).all()).results || [];
  const rows = [];
  for (const c of cabals) {
    rows.push({
      name: c.name, score: c.score, status: c.status, brokeOnNight: c.broke_on_night,
      season: c.season_id, members: await cabalMembers(env, c.id),
    });
  }
  return jsonResponse({ scope, season: ACTIVE_SEASON, leaderboard: rows });
}

// ── admin ────────────────────────────────────────────────────────────────
export async function adminPractice(request, env, user) {
  const body = await request.json().catch(() => ({}));
  const seasonId = body.season_id && SEASONS[body.season_id] ? body.season_id : ACTIVE_SEASON;
  let code, tries = 0;
  do { code = genCode(); tries++; } while (await getSession(env, code) && tries < 8);
  const name = String(body.name || '').trim().slice(0, 40) || `Practice — ${user.username || 'Admin'}`;
  const res = await env.DB.prepare(
    `INSERT INTO pact_sessions (code, season_id, host_user_id, mode, status, is_practice, current_night)
     VALUES (?, ?, ?, 'solo', 'playing', 1, 1)`
  ).bind(code, seasonId, user.userId).run();
  await createCabal(env, res.meta.last_row_id, user, name);
  return jsonResponse({ code, practice: true, season_id: seasonId });
}

export async function adminReset(request, env, user) {
  try {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM pact_commits'),
      env.DB.prepare('DELETE FROM pact_votes'),
      env.DB.prepare('DELETE FROM pact_cabal_members'),
      env.DB.prepare('DELETE FROM pact_cabals'),
      env.DB.prepare('DELETE FROM pact_sessions'),
    ]);
    return jsonResponse({ reset: true });
  } catch (e) {
    return errorResponse('Reset failed: ' + e.message, 500);
  }
}
