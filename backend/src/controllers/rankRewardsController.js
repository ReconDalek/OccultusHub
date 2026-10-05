// ── Rank rewards (monthly rank perk) ──────────────────────────────────────────
// Leadership-managed replacement for the userscript's hardcoded BASE_XANAX /
// RANK_MODIFIERS. One computation (computeRankRewards) serves:
//   • Leadership → Ranks → Rank Rewards (config + member list)
//   • the Occultus Operations userscript, via xanaxController.getDistributions
//   • Accounting's Rank Perks expense line
//
// For distribution month M:
//   rank        — earned from total hits banked BEFORE M started (chain hits +
//                 war rank_hits [actual attacks] + custom hits), same tiers as
//                 the Ranks page
//   warned      — any member_warnings row for month M-1 (blocks the reward)
//   energy avg  — month M-1's average daily energy, gym + attacks, taken
//                 straight from the Energy warning report so the numbers match
//                 Warnings → Generate → Energy exactly
//   coefficient — rank coefficient + the increment of the HIGHEST active energy
//                 threshold the member reached (tiers, not cumulative)
//   quantity    — floor(base × coefficient); ranks with coefficient 0 get none

import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { generateEnergyWarningReport } from './activityController.js';

export const FACTION_IDS = [33097, 9728, 9171];

export const RANK_TIERS = [
  { name: 'Harbinger', min: 15000 },
  { name: 'Doomsayer', min: 5000 },
  { name: 'Sentinel',  min: 2500 },
  { name: 'Arcanist',  min: 1000 },
  { name: 'Adept',     min: 500 },
  { name: 'Acolyte',   min: 0 },
];
export function getDerivedRank(totalHits) {
  for (const t of RANK_TIERS) if (totalHits >= t.min) return t.name;
  return 'Acolyte';
}

const BONUS_CATEGORIES = ['energy'];
const round2 = (n) => Math.round(n * 100) / 100;
const prevMonth = (y, m) => (m === 1 ? { year: y - 1, month: 12 } : { year: y, month: m - 1 });

export async function loadRewardConfig(env) {
  const [settings, ranks, bonuses] = await Promise.all([
    env.DB.prepare(`SELECT base_quantity, item_id, item_name, armory_tab, updated_by, updated_at FROM rank_reward_settings WHERE id = 1`).first(),
    env.DB.prepare(`SELECT rank_name, coefficient, sort_order FROM rank_reward_ranks ORDER BY sort_order ASC`).all(),
    env.DB.prepare(`SELECT id, category, threshold, increment, is_active, created_by, created_at FROM rank_reward_bonuses ORDER BY category, threshold ASC`).all(),
  ]);
  return {
    settings: settings || { base_quantity: 5, item_id: 206, item_name: 'Xanax', armory_tab: 'drugs' },
    ranks: ranks.results || [],
    bonuses: bonuses.results || [],
  };
}

// Previous month's average daily energy per member, from the Energy warning
// report itself (gym + attack energy, recruit days / transfers / exemptions
// handled exactly as there). Members with no energy row simply get no bonus.
async function energyAveragesFor(env, year, month) {
  const url = `https://internal/api/leadership/warnings/generate/energy?year=${year}&month=${month}` +
              `&factions=${FACTION_IDS.join(',')}&includeAttacks=1&includeNewMembers=1`;
  const res = await generateEnergyWarningReport(new Request(url), env);
  if (!res.ok) return {};
  const json = await res.json();
  const map = {};
  for (const m of (json.members || [])) map[m.torn_user_id] = { avg: m.avg_per_day ?? 0, days: m.tracked_days ?? null };
  return map;
}

// Highest active threshold within a category the value reaches.
function bestBonus(bonuses, category, value) {
  if (value == null) return null;
  let best = null;
  for (const b of bonuses) {
    if (b.category !== category || !b.is_active) continue;
    if (value >= b.threshold && (!best || b.threshold > best.threshold)) best = b;
  }
  return best;
}

// One member's reward: rank coefficient + best energy bonus, × base, floored.
// A rank with coefficient 0 (Acolyte) gets nothing, whatever their energy.
export function rewardFor(rankCoef, bonuses, avgEnergy, base) {
  const bonus = rankCoef > 0 ? bestBonus(bonuses, 'energy', avgEnergy) : null;
  const coefficient = rankCoef > 0 ? round2(rankCoef + (bonus?.increment || 0)) : 0;
  // + tiny epsilon so e.g. 5 × 1.6 never floors to 7.99999 → 7
  const quantity = coefficient > 0 ? Math.max(0, Math.floor(base * coefficient + 1e-9)) : 0;
  return { bonus, coefficient, quantity };
}

export async function computeRankRewards(env, { year, month, factionId = null, config = null } = {}) {
  const now = new Date();
  const y = year || now.getUTCFullYear();
  const mo = month || now.getUTCMonth() + 1;
  const prev = prevMonth(y, mo);
  const monthStart = Math.floor(Date.UTC(y, mo - 1, 1) / 1000);
  const cfg = config || await loadRewardConfig(env);
  const coefByRank = Object.fromEntries(cfg.ranks.map(r => [r.rank_name, r.coefficient]));
  const base = cfg.settings.base_quantity;

  const factionClause = factionId ? 'fm.faction_id = ?' : `fm.faction_id IN (${FACTION_IDS.join(',')})`;
  const binds = [prev.year, prev.month, monthStart, monthStart, y, mo];
  if (factionId) binds.push(factionId);

  const [{ results }, energy] = await Promise.all([
    env.DB.prepare(`
      SELECT
        fm.torn_user_id, fm.username, fm.faction_id, fm.faction_position, fm.level,
        COALESCE(ch.total_chain_hits, 0) + COALESCE(wh.total_rank_hits, 0) + COALESCE(cx.total_custom_hits, 0) AS total_hits,
        xd.id AS distribution_id, xd.quantity AS given_quantity, xd.given_by_username, xd.given_at,
        CASE WHEN xd.id IS NOT NULL THEN 1 ELSE 0 END AS is_complete,
        CASE WHEN EXISTS (
          SELECT 1 FROM member_warnings w
          WHERE w.torn_user_id = fm.torn_user_id AND w.period_year = ? AND w.period_month = ?
        ) THEN 1 ELSE 0 END AS is_warned
      FROM faction_members fm
      LEFT JOIN (
        SELECT torn_user_id, SUM(total_attacks) AS total_chain_hits
        FROM chain_hits WHERE start_at < ? GROUP BY torn_user_id
      ) ch ON ch.torn_user_id = fm.torn_user_id
      LEFT JOIN (
        SELECT wh.torn_user_id, SUM(COALESCE(wh.rank_hits, wh.war_hits)) AS total_rank_hits
        FROM war_hits wh JOIN ranked_wars rw ON rw.id = wh.ranked_war_id
        WHERE rw.ended_at < ? GROUP BY wh.torn_user_id
      ) wh ON wh.torn_user_id = fm.torn_user_id
      LEFT JOIN (
        SELECT torn_user_id, SUM(hits) AS total_custom_hits FROM custom_hits GROUP BY torn_user_id
      ) cx ON cx.torn_user_id = fm.torn_user_id
      LEFT JOIN xanax_distributions xd
        ON xd.torn_user_id = fm.torn_user_id AND xd.distribution_year = ? AND xd.distribution_month = ?
      WHERE fm.is_active = 1 AND ${factionClause}
      ORDER BY total_hits DESC, fm.username ASC
    `).bind(...binds).all(),
    energyAveragesFor(env, prev.year, prev.month).catch(() => ({})),
  ]);

  const members = (results || []).map(m => {
    const rank = getDerivedRank(m.total_hits || 0);
    const rankCoef = coefByRank[rank] ?? 0;
    const e = energy[m.torn_user_id];
    const { bonus, coefficient, quantity } = rewardFor(rankCoef, cfg.bonuses, e?.avg, base);
    return {
      ...m,
      derived_rank: rank,
      rank_coefficient: rankCoef,
      avg_energy: e ? e.avg : null,
      energy_bonus: bonus ? bonus.increment : 0,
      energy_bonus_threshold: bonus ? bonus.threshold : null,
      coefficient,
      quantity,
      is_visitor: m.faction_position === 'Socius' ? 1 : 0,
    };
  });

  return {
    year: y, month: mo,
    energy_month: prev,
    settings: cfg.settings,
    ranks: cfg.ranks,
    bonuses: cfg.bonuses,
    members,
  };
}

// ── HTTP: config ──────────────────────────────────────────────────────────────

// GET /api/leadership/rank-rewards/config
export async function getRewardConfig(request, env) {
  try { return jsonResponse(await loadRewardConfig(env)); }
  catch (e) { return errorResponse('Failed to load rank reward config: ' + e.message, 500); }
}

// PUT /api/leadership/rank-rewards/settings  { base_quantity, item_id, item_name, armory_tab }
export async function updateRewardSettings(request, env, user) {
  try {
    const b = await request.json();
    const base = parseInt(b.base_quantity, 10);
    const itemId = parseInt(b.item_id, 10);
    const itemName = String(b.item_name || '').trim();
    const tab = String(b.armory_tab || '').trim().toLowerCase();
    if (!(base >= 0 && base <= 1000)) return errorResponse('Base quantity must be 0–1000', 400);
    if (!(itemId > 0)) return errorResponse('Item ID must be a positive number', 400);
    if (!itemName) return errorResponse('Item name required', 400);
    if (!/^[a-z]+$/.test(tab)) return errorResponse('Armoury tab must be a single word (e.g. drugs)', 400);
    await env.DB.prepare(`
      UPDATE rank_reward_settings SET base_quantity = ?, item_id = ?, item_name = ?, armory_tab = ?,
        updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1
    `).bind(base, itemId, itemName, tab, user?.username ?? null).run();
    return jsonResponse(await loadRewardConfig(env));
  } catch (e) { return errorResponse('Failed to save settings: ' + e.message, 500); }
}

// PUT /api/leadership/rank-rewards/ranks  { ranks: [{ rank_name, coefficient }] }
export async function updateRewardRanks(request, env) {
  try {
    const { ranks } = await request.json();
    if (!Array.isArray(ranks) || !ranks.length) return errorResponse('ranks array required', 400);
    const valid = new Set(RANK_TIERS.map(t => t.name));
    const stmts = [];
    for (const r of ranks) {
      const c = Number(r.coefficient);
      if (!valid.has(r.rank_name)) return errorResponse(`Unknown rank: ${r.rank_name}`, 400);
      if (!(c >= 0 && c <= 20)) return errorResponse(`Coefficient for ${r.rank_name} must be 0–20`, 400);
      stmts.push(env.DB.prepare(`UPDATE rank_reward_ranks SET coefficient = ? WHERE rank_name = ?`).bind(round2(c), r.rank_name));
    }
    await env.DB.batch(stmts);
    return jsonResponse(await loadRewardConfig(env));
  } catch (e) { return errorResponse('Failed to save rank coefficients: ' + e.message, 500); }
}

function validateBonus(b) {
  const category = b.category || 'energy';
  const threshold = Number(b.threshold), increment = Number(b.increment);
  if (!BONUS_CATEGORIES.includes(category)) return { error: `Category must be one of: ${BONUS_CATEGORIES.join(', ')}` };
  if (!(threshold >= 0)) return { error: 'Threshold must be 0 or more' };
  if (!(increment > -20 && increment <= 20)) return { error: 'Increment must be between -20 and 20' };
  return { category, threshold, increment: round2(increment), is_active: b.is_active === false || b.is_active === 0 ? 0 : 1 };
}

// POST /api/leadership/rank-rewards/bonuses  { category, threshold, increment, is_active }
export async function addRewardBonus(request, env, user) {
  try {
    const v = validateBonus(await request.json());
    if (v.error) return errorResponse(v.error, 400);
    await env.DB.prepare(
      `INSERT INTO rank_reward_bonuses (category, threshold, increment, is_active, created_by) VALUES (?, ?, ?, ?, ?)`
    ).bind(v.category, v.threshold, v.increment, v.is_active, user?.username ?? null).run();
    return jsonResponse(await loadRewardConfig(env));
  } catch (e) { return errorResponse('Failed to add bonus: ' + e.message, 500); }
}

// PATCH /api/leadership/rank-rewards/bonuses/:id  { threshold?, increment?, is_active? }
export async function updateRewardBonus(request, env) {
  try {
    const id = parseInt(new URL(request.url).pathname.match(/\/bonuses\/(\d+)/)?.[1], 10);
    if (!id) return errorResponse('Invalid bonus id', 400);
    const existing = await env.DB.prepare(`SELECT * FROM rank_reward_bonuses WHERE id = ?`).bind(id).first();
    if (!existing) return errorResponse('Bonus not found', 404);
    const v = validateBonus({ ...existing, ...(await request.json()) });
    if (v.error) return errorResponse(v.error, 400);
    await env.DB.prepare(
      `UPDATE rank_reward_bonuses SET threshold = ?, increment = ?, is_active = ? WHERE id = ?`
    ).bind(v.threshold, v.increment, v.is_active, id).run();
    return jsonResponse(await loadRewardConfig(env));
  } catch (e) { return errorResponse('Failed to update bonus: ' + e.message, 500); }
}

// DELETE /api/leadership/rank-rewards/bonuses/:id
export async function deleteRewardBonus(request, env) {
  try {
    const id = parseInt(new URL(request.url).pathname.match(/\/bonuses\/(\d+)/)?.[1], 10);
    if (!id) return errorResponse('Invalid bonus id', 400);
    await env.DB.prepare(`DELETE FROM rank_reward_bonuses WHERE id = ?`).bind(id).run();
    return jsonResponse(await loadRewardConfig(env));
  } catch (e) { return errorResponse('Failed to delete bonus: ' + e.message, 500); }
}

// GET /api/leadership/rank-rewards/members?year=&month=
// The full member list exactly as the userscript sees it (Adept+ by earned
// rank, all 3 factions), plus Acolytes for reference.
export async function getRewardMembers(request, env) {
  try {
    const url = new URL(request.url);
    const year = parseInt(url.searchParams.get('year'), 10) || undefined;
    const month = parseInt(url.searchParams.get('month'), 10) || undefined;
    return jsonResponse(await computeRankRewards(env, { year, month }));
  } catch (e) { return errorResponse('Failed to compute rank rewards: ' + e.message, 500); }
}
