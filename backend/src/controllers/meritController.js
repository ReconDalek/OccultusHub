import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { LEADERSHIP_ROLES } from '../middleware/auth.js';
import { getDerivedRank } from './rankRewardsController.js';

const FACTION_IDS = [33097, 9728, 9171];
const MERIT_TYPES = ['Massacre', 'Genocide', 'Wishful Thinking'];
const CANDIDATE_LIMIT = 15;

// Weighting by earned rank (mirrors the faction's own rank ladder) — a flat,
// higher weight for anyone actually holding a leadership position. This is a
// separate scale from rank_reward_ranks' coefficients (those gate a monthly
// reward and are 0 for Acolyte; here every rank should still accrue score).
const RANK_MOD = {
  Acolyte: 1.0, Adept: 1.1, Arcanist: 1.2, Sentinel: 1.3, Doomsayer: 1.4, Harbinger: 1.5,
};
const LEADERSHIP_RANK_MOD = 1.6;

function validFactionId(raw) {
  const id = parseInt(raw, 10);
  return FACTION_IDS.includes(id) ? id : null;
}

function rankModFor(factionPosition, totalHits) {
  if (LEADERSHIP_ROLES.includes(factionPosition)) return LEADERSHIP_RANK_MOD;
  return RANK_MOD[getDerivedRank(totalHits)] ?? RANK_MOD.Acolyte;
}

// Builds the ranked candidate pool for a faction: total hits (same
// chain + war rank_hits + custom_hits definition used everywhere else),
// weighted by rank, weighted again by how consistently they've pulled 50+
// hits across the last 12 calendar months.
async function buildCandidatePool(env, factionId) {
  const now = new Date();
  const cutoff = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1) / 1000;

  const [{ results: members }, { results: monthly }] = await Promise.all([
    env.DB.prepare(`
      SELECT
        fm.torn_user_id, fm.username, fm.faction_position,
        COALESCE(ch.total_chain_hits, 0) + COALESCE(wh.total_rank_hits, 0) + COALESCE(cx.total_custom_hits, 0) AS total_hits
      FROM faction_members fm
      LEFT JOIN (
        SELECT torn_user_id, SUM(total_attacks) AS total_chain_hits
        FROM chain_hits GROUP BY torn_user_id
      ) ch ON ch.torn_user_id = fm.torn_user_id
      LEFT JOIN (
        SELECT wh.torn_user_id, SUM(COALESCE(wh.rank_hits, wh.war_hits)) AS total_rank_hits
        FROM war_hits wh GROUP BY wh.torn_user_id
      ) wh ON wh.torn_user_id = fm.torn_user_id
      LEFT JOIN (
        SELECT torn_user_id, SUM(hits) AS total_custom_hits FROM custom_hits GROUP BY torn_user_id
      ) cx ON cx.torn_user_id = fm.torn_user_id
      WHERE fm.is_active = 1 AND fm.faction_id = ?
    `).bind(factionId).all(),
    env.DB.prepare(`
      SELECT torn_user_id, strftime('%Y-%m', start_at, 'unixepoch') AS ym, SUM(total_attacks) AS hits
      FROM chain_hits
      WHERE faction_id = ? AND start_at >= ?
      GROUP BY torn_user_id, ym
    `).bind(factionId, cutoff).all(),
  ]);

  const activeMonthsByUser = new Map();
  for (const row of monthly || []) {
    if (row.hits < 50) continue;
    if (!activeMonthsByUser.has(row.torn_user_id)) activeMonthsByUser.set(row.torn_user_id, new Set());
    activeMonthsByUser.get(row.torn_user_id).add(row.ym);
  }

  return (members || []).map((m) => {
    const activeMonths = activeMonthsByUser.get(m.torn_user_id)?.size || 0;
    const consistency = Math.min(1, activeMonths / 12);
    const rankMod = rankModFor(m.faction_position, m.total_hits || 0);
    const score = (m.total_hits || 0) * rankMod * consistency;
    return {
      torn_user_id: m.torn_user_id,
      username: m.username,
      faction_position: m.faction_position,
      total_hits: m.total_hits || 0,
      consistency,
      rank_mod: rankMod,
      score,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chain-watcher/merits?faction_id=X
// Ranked "who's next" shortlist per merit type — already-awarded members are
// excluded from that type's list (member auth required).
// ─────────────────────────────────────────────────────────────────────────────
export async function getMerits(request, env) {
  const url = new URL(request.url);
  const factionId = validFactionId(url.searchParams.get('faction_id'));
  if (!factionId) return errorResponse('Invalid or missing faction_id', 400);

  try {
    const [pool, awardedResult] = await Promise.all([
      buildCandidatePool(env, factionId),
      env.DB.prepare(
        `SELECT torn_user_id, merit_type FROM member_merits WHERE torn_user_id IN (
           SELECT torn_user_id FROM faction_members WHERE faction_id = ? AND is_active = 1
         )`
      ).bind(factionId).all(),
    ]);

    const awardedSet = new Set((awardedResult.results || []).map(r => `${r.torn_user_id}:${r.merit_type}`));
    const sorted = [...pool].sort((a, b) => b.score - a.score);

    const candidates = {};
    for (const type of MERIT_TYPES) {
      candidates[type] = sorted
        .filter(m => !awardedSet.has(`${m.torn_user_id}:${type}`))
        .slice(0, CANDIDATE_LIMIT);
    }

    const awardedCounts = Object.fromEntries(
      MERIT_TYPES.map(type => [type, (awardedResult.results || []).filter(r => r.merit_type === type).length])
    );

    return jsonResponse({ meritTypes: MERIT_TYPES, candidates, awardedCounts });
  } catch (err) {
    console.error('getMerits error:', err);
    return errorResponse('Failed to fetch merit candidates', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chain-watcher/merits/award  { torn_user_id, merit_type } — leadership-only
// ─────────────────────────────────────────────────────────────────────────────
export async function awardMerit(request, env, user) {
  try {
    const body = await request.json();
    const tornUserId = parseInt(body.torn_user_id, 10);
    const meritType = body.merit_type;

    if (!tornUserId) return errorResponse('Invalid or missing torn_user_id', 400);
    if (!MERIT_TYPES.includes(meritType)) return errorResponse('Invalid merit_type', 400);

    await env.DB.prepare(
      `INSERT OR IGNORE INTO member_merits (torn_user_id, merit_type, awarded_by) VALUES (?, ?, ?)`
    ).bind(tornUserId, meritType, user.userId).run();

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('awardMerit error:', err);
    return errorResponse('Failed to record merit award', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/chain-watcher/merits/award?torn_user_id=X&merit_type=Y — leadership-only
// Undo — e.g. the award was logged against the wrong member.
// ─────────────────────────────────────────────────────────────────────────────
export async function revokeMerit(request, env) {
  try {
    const url = new URL(request.url);
    const tornUserId = parseInt(url.searchParams.get('torn_user_id'), 10);
    const meritType = url.searchParams.get('merit_type');

    if (!tornUserId) return errorResponse('Invalid or missing torn_user_id', 400);
    if (!MERIT_TYPES.includes(meritType)) return errorResponse('Invalid merit_type', 400);

    await env.DB.prepare(
      `DELETE FROM member_merits WHERE torn_user_id = ? AND merit_type = ?`
    ).bind(tornUserId, meritType).run();

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('revokeMerit error:', err);
    return errorResponse('Failed to revoke merit award', 500);
  }
}
