import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';

const FACTION_IDS = [33097, 9728, 9171];
const TARGET_RANKS = ['HARBINGER', 'DOOMSAYER', 'SENTINEL', 'ARCANIST', 'ADEPT'];

function currentUtcMonth() {
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
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

    const factionClause = factionId ? 'fm.faction_id = ?' : `fm.faction_id IN (${FACTION_IDS.join(',')})`;
    const rankPlaceholders = TARGET_RANKS.map(() => '?').join(',');

    const query = `
      SELECT
        fm.torn_user_id, fm.username, fm.faction_id, fm.faction_position, fm.level,
        xd.quantity AS given_quantity, xd.given_by_username, xd.given_at,
        CASE WHEN xd.id IS NOT NULL THEN 1 ELSE 0 END AS is_complete,
        CASE WHEN EXISTS (
          SELECT 1 FROM member_warnings w
          WHERE w.torn_user_id = fm.torn_user_id
            AND w.period_year = ? AND w.period_month = ?
        ) THEN 1 ELSE 0 END AS is_warned
      FROM faction_members fm
      LEFT JOIN xanax_distributions xd
        ON xd.torn_user_id = fm.torn_user_id
       AND xd.distribution_year = ? AND xd.distribution_month = ?
      WHERE fm.is_active = 1
        AND ${factionClause}
        AND UPPER(fm.faction_position) IN (${rankPlaceholders})
      ORDER BY fm.faction_position, fm.username ASC
    `;

    const binds = [prev.year, prev.month, targetYear, targetMonth];
    if (factionId) binds.push(factionId);
    binds.push(...TARGET_RANKS);

    const { results } = await env.DB.prepare(query).bind(...binds).all();

    return jsonResponse({ members: results || [], year: targetYear, month: targetMonth });
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
