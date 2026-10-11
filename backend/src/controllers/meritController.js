import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { LEADERSHIP_ROLES } from '../middleware/auth.js';
import { getDerivedRank } from './rankRewardsController.js';
import { getRandomUserApiKey, fetchWithRetry } from '../services/tornApiService.js';

const FACTION_IDS = [33097, 9728, 9171];
const TORN_API_BASE = 'https://api.torn.com/v2';
const CANDIDATE_LIMIT = 15;

// Torn's actual merit requires a single hit worth 100+ (Massacre) or 1,000+
// (Genocide) respect in one go — in practice that's the chain-bonus hit at
// these positions. "Wishful Thinking" isn't an official Torn merit but the
// faction has long used the same idea for its biggest chains.
export const MERIT_THRESHOLDS = {
  Massacre: [250, 500, 1000],
  Genocide: [2500, 5000, 10000],
  'Wishful Thinking': [25000, 50000, 100000],
};
const MERIT_TYPES = Object.keys(MERIT_THRESHOLDS);

export const MERIT_FORMULA_NOTE =
  'Score = (chain hits in the last 12 months) × (% of those months with 50+ hits) × a small rank weight (1.00–1.15, ' +
  'Acolyte through leadership). Recent contribution drives the score; rank only nudges it.';

// Small, deliberately narrow weighting by earned rank — contribution should
// decide this, not seniority, so the full spread top-to-bottom is capped at
// 15%. Every rank tier still gets its own step; none are skipped/collapsed.
const RANK_MOD = {
  Acolyte: 1.000, Adept: 1.025, Arcanist: 1.050, Sentinel: 1.075, Doomsayer: 1.100, Harbinger: 1.125,
};
const LEADERSHIP_RANK_MOD = 1.150;

function validFactionId(raw) {
  const id = parseInt(raw, 10);
  return FACTION_IDS.includes(id) ? id : null;
}

function rankModFor(factionPosition, lifetimeHits) {
  if (LEADERSHIP_ROLES.includes(factionPosition)) return LEADERSHIP_RANK_MOD;
  return RANK_MOD[getDerivedRank(lifetimeHits)] ?? RANK_MOD.Acolyte;
}

function meritTypeForChainPosition(position) {
  for (const [type, thresholds] of Object.entries(MERIT_THRESHOLDS)) {
    if (thresholds.includes(position)) return type;
  }
  return null;
}

// Fetches a chain's bonus-hit list from Torn and records (a) the raw bonus
// hit log and (b) a member_merits row for anyone who landed on one of our
// three merit-threshold positions. Best-effort — called right after a chain
// is saved, while the report is still available; failures here shouldn't
// block saving the chain's hit totals.
export async function recordChainBonusHits(env, tornChainId, factionId) {
  try {
    const apiKeyObj = await getRandomUserApiKey(env);
    if (!apiKeyObj?.key) return { recorded: 0, reason: 'no API key available' };

    const data = await fetchWithRetry(
      `${TORN_API_BASE}/faction/${tornChainId}/chainreport?comment=OccHub`,
      { Authorization: `ApiKey ${apiKeyObj.key}` }
    );
    const bonuses = data.chainreport?.bonuses || [];

    let recorded = 0;
    for (const b of bonuses) {
      if (!b.attacker_id || !b.chain) continue;

      await env.DB.prepare(
        `INSERT OR IGNORE INTO chain_bonus_hits (torn_chain_id, faction_id, torn_user_id, chain_position, respect)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(tornChainId, factionId, b.attacker_id, b.chain, b.respect ?? null).run();
      recorded++;

      const meritType = meritTypeForChainPosition(b.chain);
      if (meritType) {
        await env.DB.prepare(
          `INSERT OR IGNORE INTO member_merits (torn_user_id, merit_type) VALUES (?, ?)`
        ).bind(b.attacker_id, meritType).run();
      }
    }
    return { recorded };
  } catch (err) {
    console.error(`recordChainBonusHits failed for chain ${tornChainId}:`, err.message);
    return { recorded: 0, reason: err.message };
  }
}

// Builds the ranked candidate pool for a faction: chain hits over the last
// 12 months, weighted by how many of those months cleared 50+ hits, weighted
// again (lightly) by the member's established rank.
async function buildCandidatePool(env, factionId) {
  const now = new Date();
  const cutoff = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1) / 1000;

  const [{ results: members }, { results: monthly }] = await Promise.all([
    env.DB.prepare(`
      SELECT
        fm.torn_user_id, fm.username, fm.faction_position,
        COALESCE(ch.total_chain_hits, 0) + COALESCE(wh.total_rank_hits, 0) + COALESCE(cx.total_custom_hits, 0) AS lifetime_hits
      FROM faction_members fm
      LEFT JOIN (
        SELECT torn_user_id, SUM(total_attacks) AS total_chain_hits FROM chain_hits GROUP BY torn_user_id
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

  const recentByUser = new Map();
  for (const row of monthly || []) {
    if (!recentByUser.has(row.torn_user_id)) recentByUser.set(row.torn_user_id, { hits: 0, activeMonths: 0 });
    const u = recentByUser.get(row.torn_user_id);
    u.hits += row.hits;
    if (row.hits >= 50) u.activeMonths += 1;
  }

  return (members || []).map((m) => {
    const recent = recentByUser.get(m.torn_user_id) || { hits: 0, activeMonths: 0 };
    const consistency = Math.min(1, recent.activeMonths / 12);
    const rankMod = rankModFor(m.faction_position, m.lifetime_hits || 0);
    const rank = LEADERSHIP_ROLES.includes(m.faction_position) ? m.faction_position : getDerivedRank(m.lifetime_hits || 0);
    return {
      torn_user_id: m.torn_user_id,
      username: m.username,
      rank,
      recent_hits: recent.hits,
      consistency,
      rank_mod: rankMod,
      score: recent.hits * consistency * rankMod,
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

    return jsonResponse({ meritTypes: MERIT_TYPES, thresholds: MERIT_THRESHOLDS, formula: MERIT_FORMULA_NOTE, candidates, awardedCounts });
  } catch (err) {
    console.error('getMerits error:', err);
    return errorResponse('Failed to fetch merit candidates', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/chain-watcher/merits/award?torn_user_id=X&merit_type=Y — leadership-only
// Correction tool — e.g. a bonus hit was mis-attributed, or a historical
// import entry was wrong. Merits are otherwise tracked automatically.
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
