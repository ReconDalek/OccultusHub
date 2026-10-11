import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { getStaffApiKeyForFaction, fetchWithRetry } from '../services/tornApiService.js';

const TORN_API_BASE = 'https://api.torn.com/v2';
const FACTION_IDS = [33097, 9728, 9171];

function validFactionId(raw) {
  const id = parseInt(raw, 10);
  return FACTION_IDS.includes(id) ? id : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chain-watcher/live?faction_id=X
// Live proxy to Torn's chain endpoint — must use a key belonging to that exact
// faction, since Torn scopes the chain selection to the key's own faction.
// ─────────────────────────────────────────────────────────────────────────────
export async function getLiveStatus(request, env) {
  const url = new URL(request.url);
  const factionId = validFactionId(url.searchParams.get('faction_id'));
  if (!factionId) return errorResponse('Invalid or missing faction_id', 400);

  try {
    const apiKeyObj = await getStaffApiKeyForFaction(env, factionId);
    if (!apiKeyObj?.key) return errorResponse('No API key available for this faction', 503);

    const data = await fetchWithRetry(
      `${TORN_API_BASE}/faction/${factionId}/chain`,
      { Authorization: `ApiKey ${apiKeyObj.key}` }
    );

    const chain = data.chain || {};
    let status = 'idle';
    if (chain.timeout > 0) status = 'active';
    else if (chain.cooldown > 0) status = 'cooldown';

    return jsonResponse({
      factionId,
      status,
      current: chain.current || 0,
      timeout: chain.timeout || 0,
      cooldown: chain.cooldown || 0,
      start: chain.start || 0,
      end: chain.end || 0,
      fetchedAt: Math.floor(Date.now() / 1000),
    });
  } catch (err) {
    console.error('getLiveStatus error:', err);
    return errorResponse(`Torn API error: ${err.message}`, 502);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chain-watcher/shifts?faction_id=X&from=unix&to=unix
// Claimed shifts in range (an hour with no row is open). Defaults to a window
// starting an hour ago through 7 days out.
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
      `SELECT s.id, s.slot_start, s.torn_user_id, u.username
       FROM chain_watch_shifts s
       JOIN users u ON u.torn_user_id = s.torn_user_id
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
// POST /api/chain-watcher/shifts  { faction_id, slot_start }
// Claims an open hour slot for the calling member.
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

    await env.DB.prepare(
      `INSERT INTO chain_watch_shifts (faction_id, slot_start, torn_user_id) VALUES (?, ?, ?)`
    ).bind(factionId, slotStart, user.tornUserId).run();

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
// DELETE /api/chain-watcher/shifts/:id
// A member can cancel their own shift; leadership can cancel anyone's.
// ─────────────────────────────────────────────────────────────────────────────
export async function cancelShift(request, env, user) {
  try {
    const url = new URL(request.url);
    const id = parseInt(url.pathname.split('/').pop(), 10);
    if (!id) return errorResponse('Invalid shift id', 400);

    const row = await env.DB.prepare(
      `SELECT torn_user_id FROM chain_watch_shifts WHERE id = ?`
    ).bind(id).first();
    if (!row) return errorResponse('Shift not found', 404);

    const isOwnShift = row.torn_user_id === user.tornUserId;
    if (!isOwnShift && !user.isLeader && !user.isAdmin && !user.isOwner) {
      return errorResponse('You can only cancel your own shift', 403);
    }

    await env.DB.prepare(`DELETE FROM chain_watch_shifts WHERE id = ?`).bind(id).run();
    return jsonResponse({ success: true });
  } catch (err) {
    console.error('cancelShift error:', err);
    return errorResponse('Failed to cancel shift', 500);
  }
}
