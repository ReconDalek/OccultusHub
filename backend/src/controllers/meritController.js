import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { LEADERSHIP_ROLES } from '../middleware/auth.js';
import { getDerivedRank, loadRewardConfig, bestBonus } from './rankRewardsController.js';
import { getRandomUserApiKey, fetchWithRetry } from '../services/tornApiService.js';
import { generateEnergyWarningReport } from './activityController.js';
import { getActivityData } from './factionActivityController.js';
import { getInactivity } from './ocInactivityController.js';

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

// A member only shows up for a merit once they already hold its prerequisites
// — Wishful Thinking candidates must already have Massacre AND Genocide, etc.
export const MERIT_PREREQUISITES = {
  Massacre: [],
  Genocide: ['Massacre'],
  'Wishful Thinking': ['Massacre', 'Genocide'],
};

// Small, deliberately narrow weighting by earned rank — contribution should
// decide this, not seniority, so the full spread top-to-bottom is capped at
// 15%. Every rank tier still gets its own step; none are skipped/collapsed.
const RANK_MOD = {
  Acolyte: 1.000, Adept: 1.025, Arcanist: 1.050, Sentinel: 1.075, Doomsayer: 1.100, Harbinger: 1.125,
};
const LEADERSHIP_RANK_MOD = 1.150;

// A single month counts for at most 2x the faction's own average that month
// — otherwise one outlier chain could dominate a member's whole year.
const MONTH_RATIO_CAP = 2;
// Small additive nudges from being generally active — energy reuses the same
// bonus tiers Rank Rewards already exposes to leadership; presence is simple
// % of sampled 30-min slots spent active over the trailing window.
const PRESENCE_WINDOW_DAYS = 30;
const PRESENCE_BONUS_MAX = 0.2;
// Slight, capped negative modifiers — never enough alone to tank someone out
// of contention.
const WARNINGS_WINDOW_MONTHS = 6;
const WARNING_PENALTY_PER = 0.05;
const WARNING_PENALTY_CAP = 0.15;
const OC_INACTIVITY_WINDOW_DAYS = 90;
const OC_PENALTY_PER_DAY = 0.01;
const OC_PENALTY_CAP = 0.15;
const PENALTY_FLOOR = 0.7; // combined penalties never drop a score below 70% of unpenalized

export const MERIT_FORMULA_NOTE =
  'Score = hits × activity × rank × standing\n\n' +
  'hits — chain + war hits, last 12 months\n' +
  "activity — your monthly hits vs. the faction's average that month (one big month can't count for more than double), " +
  'plus small bonuses for average energy and time spent active online\n' +
  'rank — small bump for earned rank: 1.00 up to 1.15 for leadership\n' +
  'standing — reduced for recent warnings or OC inactivity, by at most 30% combined';

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

function prevMonth(y, m) {
  return m === 1 ? { year: y - 1, month: 12 } : { year: y, month: m - 1 };
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
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

// Last completed calendar month's average daily energy per member — same
// internal-call pattern and same report rankRewardsController's energy
// bonus already relies on, so the numbers match what leadership sees there.
async function fetchEnergyAverages(env) {
  const now = new Date();
  const { year, month } = prevMonth(now.getUTCFullYear(), now.getUTCMonth() + 1);
  const url = `https://internal/api/leadership/warnings/generate/energy?year=${year}&month=${month}` +
              `&factions=${FACTION_IDS.join(',')}&includeAttacks=1&includeNewMembers=1`;
  try {
    const res = await generateEnergyWarningReport(new Request(url), env);
    if (!res.ok) return {};
    const json = await res.json();
    const map = {};
    for (const m of (json.members || [])) map[m.torn_user_id] = m.avg_per_day ?? 0;
    return map;
  } catch {
    return {};
  }
}

// % of sampled 30-min activity slots spent "active" (took an action, not
// just idle-online) over the trailing window, per member.
async function fetchPresenceRatios(env, factionId) {
  const to = new Date();
  const from = new Date(to.getTime() - PRESENCE_WINDOW_DAYS * 86400000);
  const url = `https://internal/api/leadership/activity/data?faction_id=${factionId}&from=${fmtDate(from)}&to=${fmtDate(to)}`;
  try {
    const res = await getActivityData(new Request(url), env);
    if (!res.ok) return {};
    const json = await res.json();
    const map = {};
    for (const [tornUserId, info] of Object.entries(json.members || {})) {
      let active = 0, sampled = 0;
      for (const slots of Object.values(info.d || {})) {
        for (const ch of slots) {
          if (ch === '.') continue;
          sampled++;
          if (ch === '2') active++;
        }
      }
      map[tornUserId] = sampled > 0 ? active / sampled : 0;
    }
    return map;
  } catch {
    return {};
  }
}

// Inactive days per member over the trailing window (24h+ out of any OC).
async function fetchOcInactiveDays(env, factionId) {
  const to = new Date();
  const from = new Date(to.getTime() - OC_INACTIVITY_WINDOW_DAYS * 86400000);
  const url = `https://internal/api/leadership/oc/inactivity?faction_id=${factionId}&from=${fmtDate(from)}&to=${fmtDate(to)}`;
  try {
    const res = await getInactivity(new Request(url), env, null);
    if (!res.ok) return {};
    const json = await res.json();
    const map = {};
    for (const m of (json.members || [])) map[m.torn_user_id] = m.days || 0;
    return map;
  } catch {
    return {};
  }
}

// Warning counts per member over the trailing window. Only rows with a
// structured period_year/period_month can be placed in the window.
async function fetchWarningCounts(env, factionId) {
  const now = new Date();
  let y = now.getUTCFullYear(), mo = now.getUTCMonth() + 1;
  for (let i = 0; i < WARNINGS_WINDOW_MONTHS; i++) ({ year: y, month: mo } = prevMonth(y, mo));
  const cutoffYm = y * 100 + mo;

  try {
    const { results } = await env.DB.prepare(`
      SELECT torn_user_id, COUNT(*) AS cnt
      FROM member_warnings
      WHERE torn_user_id IN (SELECT torn_user_id FROM faction_members WHERE faction_id = ? AND is_active = 1)
        AND period_year IS NOT NULL AND period_month IS NOT NULL
        AND (period_year * 100 + period_month) >= ?
      GROUP BY torn_user_id
    `).bind(factionId, cutoffYm).all();
    const map = {};
    for (const r of (results || [])) map[r.torn_user_id] = r.cnt;
    return map;
  } catch {
    return {};
  }
}

// Builds the ranked candidate pool for a faction. Core volume is chain + war
// hits over the last 12 months; everything else is a small nudge on top —
// see MERIT_FORMULA_NOTE for the exact shape.
async function buildCandidatePool(env, factionId, energyBonusTiers) {
  const now = new Date();
  const cutoff = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1) / 1000;

  const [
    { results: members },
    { results: monthlyChain },
    { results: monthlyWar },
    energyByUser,
    presenceByUser,
    ocInactiveDaysByUser,
    warningCountByUser,
  ] = await Promise.all([
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
    // War hits have no date of their own — go via ranked_wars, same fallback
    // chain (ended_at → started_at → scheduled_start) rankRewardsController
    // uses. A war_hits row with no matching ranked_wars row has no knowable
    // date and is left out of the monthly breakdown (still counted in
    // lifetime_hits above, just not in the recent window).
    env.DB.prepare(`
      SELECT wh.torn_user_id,
             strftime('%Y-%m', COALESCE(rw.ended_at, rw.started_at, rw.scheduled_start), 'unixepoch') AS ym,
             SUM(COALESCE(wh.rank_hits, wh.war_hits)) AS hits
      FROM war_hits wh
      JOIN ranked_wars rw ON rw.id = wh.ranked_war_id
      WHERE wh.faction_id = ? AND COALESCE(rw.ended_at, rw.started_at, rw.scheduled_start) >= ?
      GROUP BY wh.torn_user_id, ym
    `).bind(factionId, cutoff).all(),
    fetchEnergyAverages(env),
    fetchPresenceRatios(env, factionId),
    fetchOcInactiveDays(env, factionId),
    fetchWarningCounts(env, factionId),
  ]);

  // Combine chain + war hits per user per month.
  const monthsByUser = new Map();
  for (const row of [...(monthlyChain || []), ...(monthlyWar || [])]) {
    if (!row.ym) continue;
    if (!monthsByUser.has(row.torn_user_id)) monthsByUser.set(row.torn_user_id, new Map());
    const months = monthsByUser.get(row.torn_user_id);
    months.set(row.ym, (months.get(row.ym) || 0) + row.hits);
  }

  // Faction-wide average hits per active member, per month — this is what
  // each member's month is measured against instead of a fixed threshold,
  // so the bar moves with how much the faction is actually chaining/warring.
  const activeMemberCount = (members || []).length || 1;
  const facTotalsByMonth = new Map();
  for (const months of monthsByUser.values()) {
    for (const [ym, hits] of months) facTotalsByMonth.set(ym, (facTotalsByMonth.get(ym) || 0) + hits);
  }
  const facAvgByMonth = new Map();
  for (const [ym, total] of facTotalsByMonth) facAvgByMonth.set(ym, total / activeMemberCount);

  const recentByUser = new Map();
  for (const [tornUserId, months] of monthsByUser) {
    let hits = 0;
    for (const monthHits of months.values()) hits += monthHits;

    const ratios = [];
    for (const [ym, facAvg] of facAvgByMonth) {
      if (facAvg <= 0) continue;
      const memberHits = months.get(ym) || 0;
      ratios.push(Math.min(memberHits / facAvg, MONTH_RATIO_CAP));
    }
    const relativeActivity = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0;

    recentByUser.set(tornUserId, { hits, relativeActivity });
  }

  return (members || []).map((m) => {
    const recent = recentByUser.get(m.torn_user_id) || { hits: 0, relativeActivity: 0 };
    const rankMod = rankModFor(m.faction_position, m.lifetime_hits || 0);
    const rank = LEADERSHIP_ROLES.includes(m.faction_position) ? m.faction_position : getDerivedRank(m.lifetime_hits || 0);

    const avgEnergy = energyByUser[m.torn_user_id];
    const energyBonus = avgEnergy != null
      ? (bestBonus(energyBonusTiers, 'energy', avgEnergy)?.increment || 0)
      : 0;
    const presenceRatio = presenceByUser[m.torn_user_id] || 0;
    const presenceBonus = presenceRatio * PRESENCE_BONUS_MAX;

    const activityFactor = recent.relativeActivity + energyBonus + presenceBonus;

    const warningCount = warningCountByUser[m.torn_user_id] || 0;
    const ocInactiveDays = ocInactiveDaysByUser[m.torn_user_id] || 0;
    const warningPenalty = Math.min(warningCount * WARNING_PENALTY_PER, WARNING_PENALTY_CAP);
    const ocPenalty = Math.min(ocInactiveDays * OC_PENALTY_PER_DAY, OC_PENALTY_CAP);
    const penaltyMultiplier = Math.max(PENALTY_FLOOR, 1 - warningPenalty - ocPenalty);

    return {
      torn_user_id: m.torn_user_id,
      username: m.username,
      rank,
      recent_hits: recent.hits,
      activity_factor: activityFactor,
      rank_mod: rankMod,
      warning_count: warningCount,
      oc_inactive_days: ocInactiveDays,
      penalty_multiplier: penaltyMultiplier,
      score: recent.hits * activityFactor * rankMod * penaltyMultiplier,
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
    // bestBonus needs the configured energy bonus tiers (same ones Rank
    // Rewards exposes to leadership) — load once up front and pass through.
    const cfg = await loadRewardConfig(env);

    const [pool, awardedResult] = await Promise.all([
      buildCandidatePool(env, factionId, cfg.bonuses),
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
      const prereqs = MERIT_PREREQUISITES[type];
      candidates[type] = sorted
        .filter(m => !awardedSet.has(`${m.torn_user_id}:${type}`))
        .filter(m => prereqs.every(p => awardedSet.has(`${m.torn_user_id}:${p}`)))
        .slice(0, CANDIDATE_LIMIT);
    }

    const awardedCounts = Object.fromEntries(
      MERIT_TYPES.map(type => [type, (awardedResult.results || []).filter(r => r.merit_type === type).length])
    );

    return jsonResponse({
      meritTypes: MERIT_TYPES,
      thresholds: MERIT_THRESHOLDS,
      prerequisites: MERIT_PREREQUISITES,
      formula: MERIT_FORMULA_NOTE,
      candidates,
      awardedCounts,
    });
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
