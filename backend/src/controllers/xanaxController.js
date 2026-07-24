import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';

const FACTION_IDS = [33097, 9728, 9171];

// Mirrors src/components/LeadershipTabs/MemberRanksTab.jsx RANK_TIERS —
// rank is always computed from stored hits, never from faction_position
// (the Torn-synced position can go stale between 12h syncs).
const RANK_TIERS = [
  { name: 'Harbinger', min: 15000 },
  { name: 'Doomsayer', min: 5000 },
  { name: 'Sentinel',  min: 2500 },
  { name: 'Arcanist',  min: 1000 },
  { name: 'Adept',     min: 500 },
  { name: 'Acolyte',   min: 0 },
];

function getDerivedRank(totalHits) {
  for (const tier of RANK_TIERS) {
    if (totalHits >= tier.min) return tier.name;
  }
  return 'Acolyte';
}

// Monthly rank perk formula: base xanax × rank coefficient. Acolyte has no
// coefficient — below Adept, no perk. Coefficients are a straight multiplier
// on top of a shared base, not a lookup table of flat amounts.
const BASE_XANAX = 5;
const RANK_COEFFICIENTS = {
  Adept:     1,
  Arcanist:  1.2,
  Sentinel:  1.4,
  Doomsayer: 1.6,
  Harbinger: 1.8,
};

function currentUtcMonth() {
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

// Active members of a faction who rank Adept or above — the shared
// eligibility rule for both Rank Perks and OD Insurance. Rank/hits mirror
// getDistributions (hits banked before this month started).
async function getEligibleMembers(env, factionId) {
  const now = new Date();
  const monthStart = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);

  const { results } = await env.DB.prepare(`
    SELECT
      fm.torn_user_id,
      COALESCE(ch.total_chain_hits, 0)
        + ROUND(COALESCE(wh.total_war_units, 0), 0)
        + COALESCE(cx.total_custom_hits, 0) AS total_hits
    FROM faction_members fm
    LEFT JOIN (
      SELECT torn_user_id, SUM(total_attacks) AS total_chain_hits
      FROM chain_hits WHERE start_at < ? GROUP BY torn_user_id
    ) ch ON ch.torn_user_id = fm.torn_user_id
    LEFT JOIN (
      SELECT wh.torn_user_id, SUM(wh.units) AS total_war_units
      FROM war_hits wh
      JOIN ranked_wars rw ON rw.id = wh.ranked_war_id
      WHERE rw.ended_at < ? GROUP BY wh.torn_user_id
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

// Computes this month's expected rank-perk xanax cost for one faction —
// used by accountingController's Rank Perks expense line.
export async function getFactionRankPerkExpense(env, factionId) {
  const eligible = await getEligibleMembers(env, factionId);

  let totalXanax = 0;
  for (const m of eligible) totalXanax += BASE_XANAX * RANK_COEFFICIENTS[m.rank];

  const unitPrice = await getXanaxUnitPrice(env);

  return {
    eligible_members: eligible.length,
    total_xanax: totalXanax,
    unit_price: unitPrice,
    monthly_cost: Math.round(totalXanax * unitPrice),
    configured: true,
  };
}

// Computes this month's OD Insurance xanax cost for one faction: +1 xanax
// replacement per overdose logged this month, for Adept+ members only.
// Overdose count comes from personal_stats_snapshots ($.drugs.overdoses),
// delta from the first snapshot this month to the most recent one.
export async function getFactionODInsuranceExpense(env, factionId) {
  const eligible = await getEligibleMembers(env, factionId);
  const unitPrice = await getXanaxUnitPrice(env);

  if (!eligible.length) {
    return { eligible_members: 0, members_with_overdoses: 0, total_overdoses: 0, unit_price: unitPrice, monthly_cost: 0, configured: true };
  }

  const now = new Date();
  const monthStartDate = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const todayDate = now.toISOString().slice(0, 10);
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

function previousMonth(year, month) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

// GET /api/leadership/xanax?faction_id=&year=&month=
// Returns active target-rank members (all 3 allied factions by default) with
// this month's distribution status and whether a prior-period warning blocks them.
export async function getDistributions(request, env) {
  try {
    const url = new URL(request.url);
    const factionIdParam = url.searchParams.get('faction_id');
    const factionId = factionIdParam ? parseInt(factionIdParam, 10) : null;
    if (factionIdParam && !FACTION_IDS.includes(factionId)) {
      return errorResponse('Invalid faction_id', 400);
    }

    const nowMonth = currentUtcMonth();
    const targetYear = parseInt(url.searchParams.get('year'), 10) || nowMonth.year;
    const targetMonth = parseInt(url.searchParams.get('month'), 10) || nowMonth.month;
    const prev = previousMonth(targetYear, targetMonth);

    // Only hits banked before the target month started count toward the
    // rank used for that month's eligibility — chain/war activity still
    // happening this month shouldn't let someone qualify mid-month.
    const monthStart = Math.floor(Date.UTC(targetYear, targetMonth - 1, 1) / 1000);

    const factionClause = factionId ? 'fm.faction_id = ?' : `fm.faction_id IN (${FACTION_IDS.join(',')})`;

    // Same total_hits computation as memberController.getFactionMembers —
    // pre-aggregate each hits table before joining to avoid Cartesian inflation.
    const query = `
      SELECT
        fm.torn_user_id, fm.username, fm.faction_id, fm.faction_position, fm.level,
        COALESCE(ch.total_chain_hits, 0)
          + ROUND(COALESCE(wh.total_war_units, 0), 0)
          + COALESCE(cx.total_custom_hits, 0)                    AS total_hits,
        xd.quantity AS given_quantity, xd.given_by_username, xd.given_at,
        CASE WHEN xd.id IS NOT NULL THEN 1 ELSE 0 END AS is_complete,
        CASE WHEN EXISTS (
          SELECT 1 FROM member_warnings w
          WHERE w.torn_user_id = fm.torn_user_id
            AND w.period_year = ? AND w.period_month = ?
        ) THEN 1 ELSE 0 END AS is_warned
      FROM faction_members fm
      LEFT JOIN (
        SELECT torn_user_id, SUM(total_attacks) AS total_chain_hits
        FROM chain_hits
        WHERE start_at < ?
        GROUP BY torn_user_id
      ) ch ON ch.torn_user_id = fm.torn_user_id
      LEFT JOIN (
        SELECT wh.torn_user_id, SUM(wh.units) AS total_war_units
        FROM war_hits wh
        JOIN ranked_wars rw ON rw.id = wh.ranked_war_id
        WHERE rw.ended_at < ?
        GROUP BY wh.torn_user_id
      ) wh ON wh.torn_user_id = fm.torn_user_id
      LEFT JOIN (
        SELECT torn_user_id, SUM(hits) AS total_custom_hits
        FROM custom_hits GROUP BY torn_user_id
      ) cx ON cx.torn_user_id = fm.torn_user_id
      LEFT JOIN xanax_distributions xd
        ON xd.torn_user_id = fm.torn_user_id
       AND xd.distribution_year = ? AND xd.distribution_month = ?
      WHERE fm.is_active = 1
        AND ${factionClause}
      ORDER BY total_hits DESC, fm.username ASC
    `;

    const binds = [prev.year, prev.month, monthStart, monthStart, targetYear, targetMonth];
    if (factionId) binds.push(factionId);

    const { results } = await env.DB.prepare(query).bind(...binds).all();

    // Rank comes purely from earned hits, not faction_position — drop
    // anyone who lands on Acolyte — no perk tier.
    const members = (results || [])
      .map(m => ({ ...m, derived_rank: getDerivedRank(m.total_hits) }))
      .filter(m => m.derived_rank !== 'Acolyte');

    return jsonResponse({ members, year: targetYear, month: targetMonth });
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
