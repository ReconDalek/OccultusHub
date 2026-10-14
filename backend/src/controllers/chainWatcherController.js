import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { getStaffApiKeyForFaction, fetchWithRetry } from '../services/tornApiService.js';

const TORN_API_BASE = 'https://api.torn.com/v2';
const FACTION_IDS = [33097, 9728, 9171];

function validFactionId(raw) {
  const id = parseInt(raw, 10);
  return FACTION_IDS.includes(id) ? id : null;
}

// Bot-facing auth — shared secret, same pattern as the OC Inactivity/OD
// reimbursement bot endpoints. The Discord bot has no JWT, so it can't go
// through the member/leadership checks the website routes use.
function checkChainBotSecret(request, env) {
  const auth = request.headers.get('Authorization') || '';
  return !!env.CHAIN_BOT_SECRET && auth === `Bearer ${env.CHAIN_BOT_SECRET}`;
}

// The actual Torn call, shared by the website's session-gated endpoint and
// the bot-facing one (which manages its own watch state and isn't gated by
// a website session). Must use a key belonging to this exact faction, since
// Torn scopes the chain selection to the key's own faction.
async function fetchLiveChainFromTorn(env, factionId) {
  const apiKeyObj = await getStaffApiKeyForFaction(env, factionId);
  if (!apiKeyObj?.key) {
    const err = new Error('No API key available for this faction');
    err.status = 503;
    throw err;
  }

  const data = await fetchWithRetry(
    `${TORN_API_BASE}/faction/${factionId}/chain`,
    { Authorization: `ApiKey ${apiKeyObj.key}` }
  );

  const chain = data.chain || {};
  let status = 'idle';
  if (chain.timeout > 0) status = 'active';
  else if (chain.cooldown > 0) status = 'cooldown';

  return {
    factionId,
    status,
    current: chain.current || 0,
    timeout: chain.timeout || 0,
    cooldown: chain.cooldown || 0,
    start: chain.start || 0,
    end: chain.end || 0,
    fetchedAt: Math.floor(Date.now() / 1000),
  };
}

// Deterministic simulated chain data for test mode — no Torn call. Cycles
// through a 5-minute window per "hit" window so the countdown, hit count, and
// the urgent/about-to-drop styling all get exercised automatically without
// needing a real chain or any manual input.
const TEST_CYCLE_SECONDS = 300;
const TEST_HIT_INTERVAL_SECONDS = 20;

function generateTestChainData(factionId, session) {
  const nowSecs = Math.floor(Date.now() / 1000);
  const elapsed = Math.max(0, nowSecs - (session.started_at || nowSecs));
  const cyclePos = elapsed % TEST_CYCLE_SECONDS;

  return {
    factionId,
    status: 'active',
    current: Math.floor(elapsed / TEST_HIT_INTERVAL_SECONDS) + 1,
    timeout: TEST_CYCLE_SECONDS - cyclePos,
    cooldown: 0,
    start: session.started_at,
    end: 0,
    fetchedAt: nowSecs,
    isTest: true,
  };
}

// Reads the faction's current session row, flipping a 'scheduled' session to
// 'active' once its scheduled_start has passed (lazily, on read — no cron
// needed). Returns null if nothing is scheduled/active.
async function loadCurrentSession(env, factionId) {
  const row = await env.DB.prepare(
    `SELECT * FROM chain_watch_sessions WHERE faction_id = ? AND status IN ('scheduled','active') ORDER BY id DESC LIMIT 1`
  ).bind(factionId).first();
  if (!row) return null;

  const nowSecs = Math.floor(Date.now() / 1000);
  if (row.status === 'scheduled' && row.scheduled_start != null && row.scheduled_start <= nowSecs) {
    await env.DB.prepare(
      `UPDATE chain_watch_sessions SET status = 'active', started_at = ? WHERE id = ?`
    ).bind(nowSecs, row.id).run();
    row.status = 'active';
    row.started_at = nowSecs;
  }
  return row;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chain-watcher/session?faction_id=X
// Cheap, DB-only — tells the frontend whether it should even be polling the
// live Torn endpoint. No Torn API call happens here.
// ─────────────────────────────────────────────────────────────────────────────
export async function getActiveSession(request, env) {
  const url = new URL(request.url);
  const factionId = validFactionId(url.searchParams.get('faction_id'));
  if (!factionId) return errorResponse('Invalid or missing faction_id', 400);

  try {
    const session = await loadCurrentSession(env, factionId);
    return jsonResponse({ session });
  } catch (err) {
    console.error('getActiveSession error:', err);
    return errorResponse('Failed to fetch session', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chain-watcher/session  { faction_id, scheduled_start?, is_test? }
// Leadership-only (enforced in routes.js). scheduled_start omitted/in the
// past = starts immediately; otherwise the session stays 'scheduled' until
// that time, and no Torn polling happens in the meantime. is_test starts a
// simulated chain (always immediately — there's no reason to schedule a test
// for later) so the live view can be exercised without a real chain.
// ─────────────────────────────────────────────────────────────────────────────
export async function scheduleSession(request, env, user) {
  try {
    const body = await request.json();
    const factionId = validFactionId(body.faction_id);
    if (!factionId) return errorResponse('Invalid or missing faction_id', 400);

    const existing = await loadCurrentSession(env, factionId);
    if (existing) return errorResponse('A chain watch is already scheduled or active for this faction', 409);

    const nowSecs = Math.floor(Date.now() / 1000);
    const isTest = !!body.is_test;
    const scheduledStart = isTest ? null : (body.scheduled_start ? parseInt(body.scheduled_start, 10) : null);
    const startsNow = isTest || !scheduledStart || scheduledStart <= nowSecs;

    const result = await env.DB.prepare(
      `INSERT INTO chain_watch_sessions (faction_id, status, scheduled_start, started_at, created_by, is_test)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      factionId,
      startsNow ? 'active' : 'scheduled',
      scheduledStart,
      startsNow ? nowSecs : null,
      user.tornUserId,
      isTest ? 1 : 0
    ).run();

    return jsonResponse({ success: true, id: result.meta.last_row_id });
  } catch (err) {
    console.error('scheduleSession error:', err);
    return errorResponse('Failed to schedule chain watch', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chain-watcher/session/:id/end — leadership-only.
// ─────────────────────────────────────────────────────────────────────────────
export async function endSession(request, env) {
  try {
    const match = new URL(request.url).pathname.match(/\/api\/chain-watcher\/session\/(?<id>\d+)\/end/);
    const id = match?.groups?.id;
    if (!id) return errorResponse('Invalid session id', 400);

    const nowSecs = Math.floor(Date.now() / 1000);
    const result = await env.DB.prepare(
      `UPDATE chain_watch_sessions SET status = 'ended', ended_at = ? WHERE id = ? AND status IN ('scheduled','active')`
    ).bind(nowSecs, id).run();

    if (!result.meta.changes) return errorResponse('Session not found or already ended', 404);
    return jsonResponse({ success: true });
  } catch (err) {
    console.error('endSession error:', err);
    return errorResponse('Failed to end session', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chain-watcher/live?faction_id=X
// Live proxy to Torn's chain endpoint — must use a key belonging to that exact
// faction, since Torn scopes the chain selection to the key's own faction.
// Only actually calls Torn while a session is active; otherwise this is a
// cheap no-op so a stray/old client polling this can't burn API quota.
// ─────────────────────────────────────────────────────────────────────────────
export async function getLiveStatus(request, env) {
  const url = new URL(request.url);
  const factionId = validFactionId(url.searchParams.get('faction_id'));
  if (!factionId) return errorResponse('Invalid or missing faction_id', 400);

  try {
    const session = await loadCurrentSession(env, factionId);
    if (!session || session.status !== 'active') {
      return jsonResponse({ factionId, status: 'no_session', fetchedAt: Math.floor(Date.now() / 1000) });
    }

    if (session.is_test) return jsonResponse(generateTestChainData(factionId, session));

    return jsonResponse(await fetchLiveChainFromTorn(env, factionId));
  } catch (err) {
    console.error('getLiveStatus error:', err);
    return errorResponse(err.status ? err.message : `Torn API error: ${err.message}`, err.status || 502);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/discord/chain-watcher/live?faction_id=X — bot-facing, shared-secret
// auth. No website session gate: the Discord bot tracks its own per-faction
// watch state (see OccultusBot's chainWatchers map) independently of the
// website's leader-scheduled sessions, so it polls this directly whenever
// its own /chainwatcher command is active for that faction.
// ─────────────────────────────────────────────────────────────────────────────
export async function getLiveStatusForBot(request, env) {
  if (!checkChainBotSecret(request, env)) return errorResponse('Unauthorized', 401);

  const url = new URL(request.url);
  const factionId = validFactionId(url.searchParams.get('faction_id'));
  if (!factionId) return errorResponse('Invalid or missing faction_id', 400);

  try {
    return jsonResponse(await fetchLiveChainFromTorn(env, factionId));
  } catch (err) {
    console.error('getLiveStatusForBot error:', err);
    return errorResponse(err.status ? err.message : `Torn API error: ${err.message}`, err.status || 502);
  }
}

// Current-hour + next-different-watcher for a faction, collapsing consecutive
// hours held by the same person — same rule the website's WatcherBanner uses,
// ported here so the bot doesn't need to re-derive it from raw shift rows.
async function computeCurrentWatcher(env, factionId) {
  const hour = 3600;
  const nowSecs = Math.floor(Date.now() / 1000);
  const curSlot = Math.floor(nowSecs / hour) * hour;

  const { results } = await env.DB.prepare(
    `SELECT s.slot_start, s.torn_user_id, fm.username, dl.discord_id
     FROM chain_watch_shifts s
     JOIN faction_members fm ON fm.torn_user_id = s.torn_user_id AND fm.faction_id = s.faction_id
     LEFT JOIN users u ON u.torn_user_id = s.torn_user_id
     LEFT JOIN discord_links dl ON dl.user_id = u.id
     WHERE s.faction_id = ? AND s.slot_start >= ? AND s.slot_start < ?
     ORDER BY s.slot_start ASC`
  ).bind(factionId, curSlot, curSlot + 48 * hour).all();

  const byStart = new Map((results || []).map(r => [r.slot_start, r]));
  const current = byStart.get(curSlot) || null;

  let nextSlot = curSlot + hour;
  while (current && byStart.get(nextSlot)?.torn_user_id === current.torn_user_id) {
    nextSlot += hour;
  }
  const next = byStart.get(nextSlot) || null;

  return {
    current: current ? { torn_user_id: current.torn_user_id, username: current.username, discord_id: current.discord_id || null } : null,
    next: next ? { torn_user_id: next.torn_user_id, username: next.username, discord_id: next.discord_id || null } : null,
    nextChangeAt: current ? nextSlot : null,
    currentSlot: curSlot,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/discord/chain-watcher/watcher?faction_id=X — bot-facing, shared-
// secret auth. Replaces the Google Sheet the bot used to read for its hourly
// shift-rotation ping — sign-ups now happen on the website.
// ─────────────────────────────────────────────────────────────────────────────
export async function getCurrentWatcherForBot(request, env) {
  if (!checkChainBotSecret(request, env)) return errorResponse('Unauthorized', 401);

  const url = new URL(request.url);
  const factionId = validFactionId(url.searchParams.get('faction_id'));
  if (!factionId) return errorResponse('Invalid or missing faction_id', 400);

  try {
    return jsonResponse(await computeCurrentWatcher(env, factionId));
  } catch (err) {
    console.error('getCurrentWatcherForBot error:', err);
    return errorResponse('Failed to compute current watcher', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chain-watcher/shifts?faction_id=X&from=unix&to=unix
// Claimed shifts in range (an hour with no row is open). Defaults to a window
// starting an hour ago through 7 days out. Joins faction_members (not users)
// for the username — a member can be assigned a shift without ever having a
// website account, and an INNER JOIN against users silently dropped those
// rows from this list while still enforcing the one-per-hour UNIQUE
// constraint, making an already-claimed slot look open.
// ─────────────────────────────────────────────────────────────────────────────
export async function listShifts(request, env) {
  const url = new URL(request.url);
  const factionId = validFactionId(url.searchParams.get('faction_id'));
  if (!factionId) return errorResponse('Invalid or missing faction_id', 400);

  const nowSecs = Math.floor(Date.now() / 1000);
  const from = parseInt(url.searchParams.get('from'), 10) || (nowSecs - 3600);
  const to   = parseInt(url.searchParams.get('to'), 10)   || (from + 7 * 86400);

  try {
    const result = await env.DB.prepare(
      `SELECT s.id, s.slot_start, s.torn_user_id, s.note, fm.username
       FROM chain_watch_shifts s
       JOIN faction_members fm ON fm.torn_user_id = s.torn_user_id AND fm.faction_id = s.faction_id
       WHERE s.faction_id = ? AND s.slot_start >= ? AND s.slot_start < ?
       ORDER BY s.slot_start ASC`
    ).bind(factionId, from, to).all();

    return jsonResponse({ shifts: result.results || [] });
  } catch (err) {
    console.error('listShifts error:', err);
    return errorResponse('Failed to fetch shifts', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chain-watcher/shifts  { faction_id, slot_start, torn_user_id? }
// Claims an open hour slot for the calling member. Once claimed, only
// leadership can free it again (see cancelShift) — there's no self-service
// cancel, by design: the frontend makes members confirm that before signing up.
// A leader may pass torn_user_id to assign the slot to someone else (e.g. a
// member who asked a leader to sign them up) — anyone else attempting that
// is rejected.
// ─────────────────────────────────────────────────────────────────────────────
export async function signUpShift(request, env, user) {
  try {
    const body = await request.json();
    const factionId = validFactionId(body.faction_id);
    const slotStart = parseInt(body.slot_start, 10);

    if (!factionId) return errorResponse('Invalid or missing faction_id', 400);
    if (!slotStart || slotStart % 3600 !== 0) {
      return errorResponse('slot_start must be a unix timestamp on the hour', 400);
    }

    const currentHour = Math.floor(Date.now() / 3600000) * 3600;
    if (slotStart < currentHour) return errorResponse('Cannot sign up for a past shift', 400);

    let targetUserId = user.tornUserId;
    if (body.torn_user_id != null && parseInt(body.torn_user_id, 10) !== user.tornUserId) {
      if (!user.isLeader && !user.isAdmin && !user.isOwner) {
        return errorResponse('Leadership access required to assign another member', 403);
      }
      targetUserId = parseInt(body.torn_user_id, 10);
      const target = await env.DB.prepare(
        `SELECT torn_user_id FROM faction_members WHERE torn_user_id = ? AND faction_id = ? AND is_active = 1`
      ).bind(targetUserId, factionId).first();
      if (!target) return errorResponse('That member is not an active member of this faction', 400);
    }

    await env.DB.prepare(
      `INSERT INTO chain_watch_shifts (faction_id, slot_start, torn_user_id) VALUES (?, ?, ?)`
    ).bind(factionId, slotStart, targetUserId).run();

    return jsonResponse({ success: true });
  } catch (err) {
    if (String(err.message || '').includes('UNIQUE')) {
      return errorResponse('That shift is already taken', 409);
    }
    console.error('signUpShift error:', err);
    return errorResponse('Failed to sign up for shift', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chain-watcher/members?faction_id=X — leadership-only.
// Plain active-member roster for the shift-assign picker.
// ─────────────────────────────────────────────────────────────────────────────
export async function listActiveMembers(request, env) {
  const url = new URL(request.url);
  const factionId = validFactionId(url.searchParams.get('faction_id'));
  if (!factionId) return errorResponse('Invalid or missing faction_id', 400);

  try {
    const { results } = await env.DB.prepare(
      `SELECT torn_user_id, username FROM faction_members WHERE faction_id = ? AND is_active = 1 ORDER BY username ASC`
    ).bind(factionId).all();
    return jsonResponse({ members: results || [] });
  } catch (err) {
    console.error('listActiveMembers error:', err);
    return errorResponse('Failed to fetch members', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/chain-watcher/shifts/:id — leadership-only (enforced in
// routes.js; checked again here too). A member who signed up can't remove
// themselves — only leadership frees a slot (e.g. a no-show).
// ─────────────────────────────────────────────────────────────────────────────
export async function cancelShift(request, env, user) {
  try {
    if (!user.isLeader && !user.isAdmin && !user.isOwner) {
      return errorResponse('Leadership access required', 403);
    }

    const url = new URL(request.url);
    const id = parseInt(url.pathname.split('/').pop(), 10);
    if (!id) return errorResponse('Invalid shift id', 400);

    const result = await env.DB.prepare(`DELETE FROM chain_watch_shifts WHERE id = ?`).bind(id).run();
    if (!result.meta.changes) return errorResponse('Shift not found', 404);

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('cancelShift error:', err);
    return errorResponse('Failed to cancel shift', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chain-watcher/shifts/:id/note  { note }
// Leadership-only. Record of what happened on a shift (e.g. a no-show) —
// surfaced to leadership in the frontend, not shown to regular members.
// ─────────────────────────────────────────────────────────────────────────────
export async function setShiftNote(request, env) {
  try {
    const match = new URL(request.url).pathname.match(/\/api\/chain-watcher\/shifts\/(?<id>\d+)\/note/);
    const id = match?.groups?.id;
    if (!id) return errorResponse('Invalid shift id', 400);

    const { note } = await request.json();

    const result = await env.DB.prepare(
      `UPDATE chain_watch_shifts SET note = ? WHERE id = ?`
    ).bind(note || null, id).run();

    if (!result.meta.changes) return errorResponse('Shift not found', 404);
    return jsonResponse({ success: true });
  } catch (err) {
    console.error('setShiftNote error:', err);
    return errorResponse('Failed to save note', 500);
  }
}
