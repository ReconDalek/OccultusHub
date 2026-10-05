import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
// Rank tiers, base quantity, rank coefficients and energy bonuses now live in
// rankRewardsController (leadership-managed config) — this controller keeps
// serving the Occultus Operations userscript's endpoints on top of it.
import { FACTION_IDS, getDerivedRank, computeRankRewards } from './rankRewardsController.js';

function currentUtcMonth() {
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

// Active members of a faction who rank Adept or above — the shared
// eligibility rule for both Rank Perks and OD Insurance. Rank/hits mirror
// getDistributions (hits banked before this month started).
// `asOfTs` lets callers ask "who was eligible as of month X" (OD Insurance
// looking at a past month) instead of always the live current month — an
// omitted asOfTs keeps the original current-month behavior.
async function getEligibleMembers(env, factionId, asOfTs) {
  const now = new Date();
  const monthStart = asOfTs ?? Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);

  const { results } = await env.DB.prepare(`
    SELECT
      fm.torn_user_id,
      COALESCE(ch.total_chain_hits, 0)
        + COALESCE(wh.total_rank_hits, 0)
        + COALESCE(cx.total_custom_hits, 0) AS total_hits
    FROM faction_members fm
    LEFT JOIN (
      SELECT torn_user_id, SUM(total_attacks) AS total_chain_hits
      FROM chain_hits WHERE start_at < ? GROUP BY torn_user_id
    ) ch ON ch.torn_user_id = fm.torn_user_id
    LEFT JOIN (
      -- Actual war attacks (rank_hits), never payout units/respect — same as the Ranks page.
      SELECT wh.torn_user_id, SUM(COALESCE(wh.rank_hits, wh.war_hits)) AS total_rank_hits
      FROM war_hits wh
      JOIN ranked_wars rw ON rw.id = wh.ranked_war_id
      -- Manually entered historic wars have no ended_at — fall back to their
        -- start, otherwise every manual war's hits were silently dropped.
        WHERE COALESCE(rw.ended_at, rw.started_at, rw.scheduled_start) < ? GROUP BY wh.torn_user_id
    ) wh ON wh.torn_user_id = fm.torn_user_id
    LEFT JOIN (
      SELECT torn_user_id, SUM(hits) AS total_custom_hits
      FROM custom_hits GROUP BY torn_user_id
    ) cx ON cx.torn_user_id = fm.torn_user_id
    WHERE fm.is_active = 1 AND fm.faction_id = ?
  `).bind(monthStart, monthStart, factionId).all();

  return (results || [])
    .map(m => ({ torn_user_id: m.torn_user_id, rank: getDerivedRank(m.total_hits || 0) }))
    .filter(m => m.rank !== 'Acolyte');
}

async function getXanaxUnitPrice(env) {
  const priceRow = await env.DB.prepare(
    `SELECT effective_price FROM item_prices_cache WHERE name = 'Xanax'`
  ).first();
  return priceRow?.effective_price ?? 0;
}

// Computes this month's expected rank-perk cost for one faction — used by
// accountingController's Rank Perks expense line. Uses the leadership-managed
// rank reward config (base × rank coefficient + energy bonus), counting only
// members who'd actually receive it (not warned, not Socius visitors).
// Priced at the configured item's price (falls back to Xanax's).
export async function getFactionRankPerkExpense(env, factionId) {
  const r = await computeRankRewards(env, { factionId });
  const receiving = r.members.filter(m => m.quantity > 0 && !m.is_warned && !m.is_visitor);
  const totalXanax = receiving.reduce((s, m) => s + m.quantity, 0);

  const itemName = r.settings?.item_name || 'Xanax';
  const priceRow = await env.DB.prepare(`SELECT effective_price FROM item_prices_cache WHERE name = ?`).bind(itemName).first();
  const unitPrice = priceRow?.effective_price ?? await getXanaxUnitPrice(env);

  return {
    eligible_members: receiving.length,
    total_xanax: totalXanax,
    item_name: itemName,
    unit_price: unitPrice,
    monthly_cost: Math.round(totalXanax * unitPrice),
    configured: true,
  };
}

// Computes one month's OD Insurance xanax cost for one faction: +1 xanax
// replacement per overdose logged that month, for Adept+ members only.
// Overdose count comes from personal_stats_snapshots ($.drugs.overdoses),
// delta from the first snapshot in the month to the last. `monthStartTs`/
// `monthEndTs` (unix seconds) let accountingController ask about a past
// month instead of always the live current one — both default to the
// current calendar month when omitted, preserving prior behavior.
export async function getFactionODInsuranceExpense(env, factionId, monthStartTs, monthEndTs) {
  const now = new Date();
  const defaultStart = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);
  const start = monthStartTs ?? defaultStart;
  const end   = monthEndTs   ?? Math.floor(now.getTime() / 1000);

  // Eligibility (Adept+) is judged as of the START of the target month —
  // matches "hits banked before this month started" for a historical month too.
  const eligible = await getEligibleMembers(env, factionId, start);
  const unitPrice = await getXanaxUnitPrice(env);

  if (!eligible.length) {
    return { eligible_members: 0, members_with_overdoses: 0, total_overdoses: 0, unit_price: unitPrice, monthly_cost: 0, configured: true };
  }

  const monthStartDate = new Date(start * 1000).toISOString().slice(0, 10);
  const todayDate      = new Date(end * 1000).toISOString().slice(0, 10);
  const ids = eligible.map(m => m.torn_user_id);
  const placeholders = ids.map(() => '?').join(',');

  const [startRows, endRows] = await Promise.all([
    env.DB.prepare(`
      SELECT p.torn_user_id, CAST(json_extract(p.stats, '$.drugs.overdoses') AS INTEGER) AS val
      FROM personal_stats_snapshots p
      INNER JOIN (
        SELECT torn_user_id, MIN(snapshot_date) AS min_date
        FROM personal_stats_snapshots
        WHERE snapshot_date >= ? AND snapshot_date <= ? AND torn_user_id IN (${placeholders})
        GROUP BY torn_user_id
      ) s ON p.torn_user_id = s.torn_user_id AND p.snapshot_date = s.min_date
    `).bind(monthStartDate, todayDate, ...ids).all(),
    env.DB.prepare(`
      SELECT p.torn_user_id, CAST(json_extract(p.stats, '$.drugs.overdoses') AS INTEGER) AS val
      FROM personal_stats_snapshots p
      INNER JOIN (
        SELECT torn_user_id, MAX(snapshot_date) AS max_date
        FROM personal_stats_snapshots
        WHERE snapshot_date >= ? AND snapshot_date <= ? AND torn_user_id IN (${placeholders})
        GROUP BY torn_user_id
      ) e ON p.torn_user_id = e.torn_user_id AND p.snapshot_date = e.max_date
    `).bind(monthStartDate, todayDate, ...ids).all(),
  ]);

  const odStart = {};
  for (const r of startRows.results || []) odStart[r.torn_user_id] = r.val ?? 0;

  let totalOverdoses = 0;
  let membersWithOverdoses = 0;
  for (const r of endRows.results || []) {
    const delta = Math.max(0, (r.val ?? 0) - (odStart[r.torn_user_id] ?? 0));
    if (delta > 0) { totalOverdoses += delta; membersWithOverdoses++; }
  }

  return {
    eligible_members: eligible.length,
    members_with_overdoses: membersWithOverdoses,
    total_overdoses: totalOverdoses,
    unit_price: unitPrice,
    monthly_cost: Math.round(totalOverdoses * unitPrice),
    configured: true,
  };
}

// GET /api/leadership/xanax?faction_id=&year=&month=
// Serves the Occultus Operations userscript's Monthly Xanax list: active
// members ranked Adept+ by earned hits, with this month's distribution status,
// whether a prior-month warning blocks them, and — from the rank reward config
// (rankRewardsController) — their coefficient, energy bonus and the exact
// quantity to give. Top-level settings carry the base quantity, item ID/name
// and armoury tab. Older script versions that only read derived_rank /
// is_complete / is_warned keep working (those fields are unchanged).
export async function getDistributions(request, env) {
  try {
    const url = new URL(request.url);
    const factionIdParam = url.searchParams.get('faction_id');
    const factionId = factionIdParam ? parseInt(factionIdParam, 10) : null;
    if (factionIdParam && !FACTION_IDS.includes(factionId)) {
      return errorResponse('Invalid faction_id', 400);
    }
    const year = parseInt(url.searchParams.get('year'), 10) || undefined;
    const month = parseInt(url.searchParams.get('month'), 10) || undefined;

    const r = await computeRankRewards(env, { year, month, factionId });
    const members = r.members.filter(m => m.derived_rank !== 'Acolyte');

    return jsonResponse({
      members, year: r.year, month: r.month,
      settings: r.settings,
      ranks: r.ranks,
      energy_month: r.energy_month,
    });
  } catch (err) {
    console.error('getDistributions error:', err);
    return errorResponse('Failed to fetch xanax distributions', 500);
  }
}

// POST /api/leadership/xanax
// Body: { torn_user_id, username, quantity, year?, month? }
export async function markDistribution(request, env, user) {
  try {
    const body = await request.json();
    const { torn_user_id, username, quantity } = body;

    if (!torn_user_id || !username || !quantity) {
      return errorResponse('Missing required fields: torn_user_id, username, quantity', 400);
    }

    const nowMonth = currentUtcMonth();
    const year = parseInt(body.year, 10) || nowMonth.year;
    const month = parseInt(body.month, 10) || nowMonth.month;
    const now = Math.floor(Date.now() / 1000);

    await env.DB.prepare(`
      INSERT INTO xanax_distributions
        (torn_user_id, distribution_year, distribution_month, quantity, given_by, given_by_username, given_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(torn_user_id, distribution_year, distribution_month) DO UPDATE SET
        quantity = excluded.quantity,
        given_by = excluded.given_by,
        given_by_username = excluded.given_by_username,
        given_at = excluded.given_at
    `).bind(
      torn_user_id, year, month, quantity,
      user.tornUserId, user.username, now
    ).run();

    return jsonResponse({ message: 'Distribution marked complete' });
  } catch (err) {
    console.error('markDistribution error:', err);
    return errorResponse('Failed to mark distribution', 500);
  }
}

// DELETE /api/leadership/xanax/:id
export async function deleteDistribution(request, env) {
  try {
    const id = parseInt(new URL(request.url).pathname.split('/').pop(), 10);
    if (!id) return errorResponse('Invalid distribution ID', 400);

    await env.DB.prepare(`DELETE FROM xanax_distributions WHERE id = ?`).bind(id).run();
    return jsonResponse({ message: 'Distribution unmarked' });
  } catch (err) {
    console.error('deleteDistribution error:', err);
    return errorResponse('Failed to unmark distribution', 500);
  }
}
