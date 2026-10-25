import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { getRandomUserApiKey, fetchWithRetry } from '../services/tornApiService.js';
import { recordBonusHitEntries, MERIT_THRESHOLDS } from './meritController.js';
import { TARGET_LENGTHS, estimateChainDuration } from './chainController.js';

const TORN_API_BASE = 'https://api.torn.com/v2';
const DISCORD_API = 'https://discord.com/api/v10';
const FACTION_IDS = [33097, 9728, 9171];
const FACTION_NAMES = { 33097: 'Occultus', 9728: 'Occul2us', 9171: 'Occul3us' };
const HOUR = 3600;

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
// a website session). The faction chain endpoint is public — any valid key
// can read any faction's chain status — so this draws from the full
// submitted-key pool rather than requiring one belonging to this specific
// faction's own leadership, which would fail outright if that faction
// happened to have no staff key on file.
async function fetchLiveChainFromTorn(env, factionId) {
  const keyProbe = await getRandomUserApiKey(env);
  if (!keyProbe?.key) {
    const err = new Error('No API key available');
    err.status = 503;
    throw err;
  }

  const data = await fetchWithRetry(
    `${TORN_API_BASE}/faction/${factionId}/chain`,
    () => getRandomUserApiKey(env),
    env
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
// POST /api/chain-watcher/session  { faction_id, scheduled_start?, is_test?, target_length? }
// Leadership-only (enforced in routes.js). scheduled_start omitted/in the
// past = starts immediately; otherwise the session stays 'scheduled' until
// that time, and no Torn polling happens in the meantime. is_test starts a
// simulated chain (always immediately — there's no reason to schedule a test
// for later) so the live view can be exercised without a real chain.
// target_length is an optional goal chain length, one of TARGET_LENGTHS.
// ─────────────────────────────────────────────────────────────────────────────
export async function scheduleSession(request, env, user) {
  try {
    const body = await request.json();
    const factionId = validFactionId(body.faction_id);
    if (!factionId) return errorResponse('Invalid or missing faction_id', 400);

    const existing = await loadCurrentSession(env, factionId);
    if (existing) return errorResponse('A chain watch is already scheduled or active for this faction', 409);

    let targetLength = null;
    if (body.target_length != null) {
      const t = parseInt(body.target_length, 10);
      if (!TARGET_LENGTHS.includes(t)) return errorResponse('Invalid target_length', 400);
      targetLength = t;
    }

    const nowSecs = Math.floor(Date.now() / 1000);
    const isTest = !!body.is_test;
    const scheduledStart = isTest ? null : (body.scheduled_start ? parseInt(body.scheduled_start, 10) : null);
    const startsNow = isTest || !scheduledStart || scheduledStart <= nowSecs;

    const result = await env.DB.prepare(
      `INSERT INTO chain_watch_sessions (faction_id, status, scheduled_start, started_at, created_by, is_test, target_length)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      factionId,
      startsNow ? 'active' : 'scheduled',
      scheduledStart,
      startsNow ? nowSecs : null,
      user.tornUserId,
      isTest ? 1 : 0,
      targetLength
    ).run();

    return jsonResponse({ success: true, id: result.meta.last_row_id });
  } catch (err) {
    console.error('scheduleSession error:', err);
    return errorResponse('Failed to schedule chain watch', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chain-watcher/target-estimate?faction_id=X&target=Y — leadership-
// only. Estimated time to reach a target chain length, from this faction's
// own chain history — see estimateChainDuration for the method/caveats.
// ─────────────────────────────────────────────────────────────────────────────
export async function getTargetEstimate(request, env) {
  const url = new URL(request.url);
  const factionId = validFactionId(url.searchParams.get('faction_id'));
  const target = parseInt(url.searchParams.get('target'), 10);
  if (!factionId) return errorResponse('Invalid or missing faction_id', 400);
  if (!TARGET_LENGTHS.includes(target)) return errorResponse('Invalid target', 400);

  try {
    const estimate = await estimateChainDuration(env, factionId, target);
    return jsonResponse({ target, ...estimate });
  } catch (err) {
    console.error('getTargetEstimate error:', err);
    return errorResponse('Failed to compute estimate', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chain-watcher/session/:id/end — leadership-only.
// Ending a test session also runs a synthetic bonus-hit report through the
// same recordBonusHitEntries insertion a real chain uses — one simulated hit
// at each merit type's lowest threshold, attributed to the leader ending it —
// so the whole auto-tracking pipeline (chain_bonus_hits log + member_merits
// auto-award) can be verified on demand without a real chain ever running.
// ─────────────────────────────────────────────────────────────────────────────
export async function endSession(request, env, user) {
  try {
    const match = new URL(request.url).pathname.match(/\/api\/chain-watcher\/session\/(?<id>\d+)\/end/);
    const id = match?.groups?.id;
    if (!id) return errorResponse('Invalid session id', 400);

    const session = await env.DB.prepare(
      `SELECT * FROM chain_watch_sessions WHERE id = ? AND status IN ('scheduled','active')`
    ).bind(id).first();
    if (!session) return errorResponse('Session not found or already ended', 404);

    const nowSecs = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `UPDATE chain_watch_sessions SET status = 'ended', ended_at = ? WHERE id = ?`
    ).bind(nowSecs, id).run();

    let meritTest = null;
    if (session.is_test) {
      const testChainId = -session.id; // negative — can never collide with a real Torn chain id
      const bonuses = Object.values(MERIT_THRESHOLDS).map((positions) => ({
        attacker_id: user.tornUserId,
        chain: positions[0],
        respect: null,
      }));
      meritTest = await recordBonusHitEntries(env, testChainId, session.faction_id, bonuses);
    }

    return jsonResponse({ success: true, meritTest });
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

// Current hour + the LITERAL next hour's assignment (no skip-ahead) — the
// bot's hourly ping needs to tell apart three distinct cases for the next
// hour specifically: nobody signed up (a gap — announce it, don't silently
// search further ahead for someone), the same person covering back-to-back
// (double duty), or a genuine handoff to someone else. Deliberately NOT the
// "collapse consecutive hours / skip past gaps" rule the website's own
// WatcherBanner uses for its own different purpose (a running summary of who
// has the chain covered) — that's wrong for a ping that fires fresh every
// hour and would otherwise present someone 3 hours out as if they're "up
// next" while the hour right after this one sits silently unclaimed.
async function computeCurrentWatcher(env, factionId) {
  const hour = 3600;
  const nowSecs = Math.floor(Date.now() / 1000);
  const curSlot = Math.floor(nowSecs / hour) * hour;
  const nextSlot = curSlot + hour;

  const { results } = await env.DB.prepare(
    `SELECT s.slot_start, s.torn_user_id,
       COALESCE(
         (SELECT username FROM faction_members WHERE torn_user_id = s.torn_user_id AND faction_id = s.faction_id LIMIT 1),
         (SELECT username FROM faction_members WHERE torn_user_id = s.torn_user_id ORDER BY is_active DESC LIMIT 1)
       ) AS username,
       dl.discord_id
     FROM chain_watch_shifts s
     LEFT JOIN users u ON u.torn_user_id = s.torn_user_id
     LEFT JOIN discord_links dl ON dl.user_id = u.id
     WHERE s.faction_id = ? AND s.slot_start IN (?, ?)`
  ).bind(factionId, curSlot, nextSlot).all();

  const byStart = new Map((results || []).map(r => [r.slot_start, r]));
  const current = byStart.get(curSlot) || null;
  const next = byStart.get(nextSlot) || null;

  return {
    current: current ? { torn_user_id: current.torn_user_id, username: current.username, discord_id: current.discord_id || null } : null,
    next: next ? { torn_user_id: next.torn_user_id, username: next.username, discord_id: next.discord_id || null } : null,
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
// starting an hour ago through 7 days out. Resolves the username from
// faction_members (not users) via a scalar subquery rather than a plain JOIN,
// for two reasons found the hard way: (1) a member can be assigned a shift
// without ever having a website account — an INNER JOIN against users
// silently dropped those rows while still enforcing the one-per-hour UNIQUE
// constraint, making an already-claimed slot look open; (2) leadership signs
// up for shifts across all three factions, not just their own roster's — a
// plain JOIN requiring faction_members.faction_id to match the shift's own
// faction_id dropped THEM too (e.g. an Occ1 leader self-signing up for an
// Occ2 slot). The subquery prefers a faction_members row matching the
// shift's own faction, falling back to any row for that user (so a
// cross-faction signup still resolves a username) rather than requiring one.
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
      `SELECT s.id, s.slot_start, s.torn_user_id, s.note,
         COALESCE(
           (SELECT username FROM faction_members WHERE torn_user_id = s.torn_user_id AND faction_id = s.faction_id LIMIT 1),
           (SELECT username FROM faction_members WHERE torn_user_id = s.torn_user_id ORDER BY is_active DESC LIMIT 1)
         ) AS username
       FROM chain_watch_shifts s
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

// ─────────────────────────────────────────────────────────────────────────────
// Cron: DMs anyone signed up for a chain-watch shift starting in about an
// hour, if they've linked Discord. Runs every 10 min; the check window (50-70
// min out) is wider than the cron interval so a shift can never slip through
// between two ticks, and reminder_sent_at stops the same shift firing twice.
// ─────────────────────────────────────────────────────────────────────────────
export async function sendShiftReminders(env) {
  if (!env.DISCORD_BOT_TOKEN) {
    console.warn('[chain-watch reminders] no DISCORD_BOT_TOKEN configured, skipping');
    return { sent: 0, failed: 0 };
  }

  const nowSecs = Math.floor(Date.now() / 1000);
  const windowStart = nowSecs + 50 * 60;
  const windowEnd = nowSecs + 70 * 60;

  const { results } = await env.DB.prepare(
    `SELECT s.id, s.faction_id, s.slot_start, dl.discord_id
     FROM chain_watch_shifts s
     JOIN users u ON u.torn_user_id = s.torn_user_id
     JOIN discord_links dl ON dl.user_id = u.id
     WHERE s.reminder_sent_at IS NULL AND s.slot_start >= ? AND s.slot_start < ?
       AND NOT EXISTS (
         -- Skip anyone already on shift the hour immediately before this
         -- one — if they're the current watcher continuing straight into
         -- the next hour, they're already actively watching and don't
         -- need a "starts in an hour" heads up.
         SELECT 1 FROM chain_watch_shifts prev
         WHERE prev.faction_id = s.faction_id AND prev.torn_user_id = s.torn_user_id
           AND prev.slot_start = s.slot_start - 3600
       )`
  ).bind(windowStart, windowEnd).all();

  let sent = 0, failed = 0;
  for (const shift of (results || [])) {
    try {
      const dmRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
        method: 'POST',
        headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_id: shift.discord_id }),
      });
      if (!dmRes.ok) throw new Error(`open DM channel: HTTP ${dmRes.status}`);
      const dmChannel = await dmRes.json();

      const factionName = FACTION_NAMES[shift.faction_id] || `faction ${shift.faction_id}`;
      // Discord's <t:...> timestamp renders in each viewer's own local time/format automatically.
      const content = `⏰ Your ${factionName} chain watch shift starts <t:${shift.slot_start}:t> (in about an hour). Thanks for covering it!`;

      const msgRes = await fetch(`${DISCORD_API}/channels/${dmChannel.id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!msgRes.ok) throw new Error(`send DM: HTTP ${msgRes.status}`);
      sent++;
    } catch (err) {
      failed++;
      console.error(`[chain-watch reminders] failed for shift ${shift.id}:`, err.message);
    } finally {
      // Mark attempted either way — a failure (e.g. DMs closed, not linked
      // properly) isn't worth retrying every 10 minutes for the same shift.
      await env.DB.prepare(`UPDATE chain_watch_shifts SET reminder_sent_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(shift.id).run();
    }
  }

  console.log(`[chain-watch reminders] ${sent} sent, ${failed} failed`);
  return { sent, failed };
}

const WATCH_GAP_SECONDS = 3 * 86400; // 3+ days with nothing claimed = a separate watch

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chain-watcher/watch-totals?faction_id=X — leadership-only
// Groups every claimed shift for this faction into separate "watches" by
// gap — a run of claimed hours broken by 3+ days with nothing claimed is
// treated as a different (future) watch rather than lumped into the current
// one's totals, picks whichever group is "current", and returns per-member
// completed/upcoming/total counts for just that group.
// ─────────────────────────────────────────────────────────────────────────────
export async function getWatchTotals(request, env) {
  try {
    const url = new URL(request.url);
    const factionId = validFactionId(url.searchParams.get('faction_id'));
    if (!factionId) return errorResponse('Invalid or missing faction_id', 400);

    const { results } = await env.DB.prepare(
      `SELECT s.slot_start, s.torn_user_id, s.note,
         COALESCE(
           (SELECT username FROM faction_members WHERE torn_user_id = s.torn_user_id AND faction_id = s.faction_id LIMIT 1),
           (SELECT username FROM faction_members WHERE torn_user_id = s.torn_user_id ORDER BY is_active DESC LIMIT 1)
         ) AS username
       FROM chain_watch_shifts s
       WHERE s.faction_id = ?
       ORDER BY s.slot_start ASC`
    ).bind(factionId).all();

    const shifts = results || [];
    if (!shifts.length) {
      return jsonResponse({ watchStart: null, watchEnd: null, totalShifts: 0, members: [] });
    }

    // Split into groups wherever two consecutive claimed hours are more
    // than WATCH_GAP_SECONDS apart.
    const groups = [];
    let current = [shifts[0]];
    for (let i = 1; i < shifts.length; i++) {
      if (shifts[i].slot_start - shifts[i - 1].slot_start > WATCH_GAP_SECONDS) {
        groups.push(current);
        current = [];
      }
      current.push(shifts[i]);
    }
    groups.push(current);

    const nowSecs = Math.floor(Date.now() / 1000);
    // Prefer the group that actually brackets "now"; otherwise the most
    // recently-started group that's already underway; otherwise (nothing
    // has started yet) the earliest upcoming one.
    let activeGroup = groups.find(g => g[0].slot_start <= nowSecs && nowSecs < g[g.length - 1].slot_start + HOUR);
    if (!activeGroup) {
      const pastGroups = groups.filter(g => g[0].slot_start <= nowSecs);
      activeGroup = pastGroups.length ? pastGroups[pastGroups.length - 1] : groups[0];
    }

    const totals = new Map(); // torn_user_id -> { username, completed, upcoming, notes }
    for (const s of activeGroup) {
      const entry = totals.get(s.torn_user_id) || { torn_user_id: s.torn_user_id, username: s.username, completed: 0, upcoming: 0, notes: [] };
      if (s.slot_start + HOUR <= nowSecs) entry.completed++;
      else entry.upcoming++;
      if (s.note) entry.notes.push({ slot_start: s.slot_start, note: s.note });
      totals.set(s.torn_user_id, entry);
    }

    const members = [...totals.values()]
      .map(m => ({ ...m, total: m.completed + m.upcoming }))
      .sort((a, b) => b.total - a.total);

    return jsonResponse({
      watchStart: activeGroup[0].slot_start,
      watchEnd: activeGroup[activeGroup.length - 1].slot_start + HOUR,
      totalShifts: activeGroup.length,
      members,
    });
  } catch (err) {
    console.error('getWatchTotals error:', err);
    return errorResponse('Failed to compute watch totals', 500);
  }
}
