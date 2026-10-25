import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { FACTION_IDS } from './rankRewardsController.js';

// Each watched hour that has already passed earns 1 Xanax — flat rate, no
// rank coefficient (unlike the Monthly Xanax rank perk). Shared with the
// Occultus Operations userscript, which reuses its existing armoury
// auto-fill flow for this item/tab.
const ITEM = { item_id: 206, item_name: 'Xanax', armory_tab: 'drugs' };

function currentHourStart() {
  return Math.floor(Date.now() / 3600) * 3600;
}

function validFactionId(raw) {
  const id = parseInt(raw, 10);
  return FACTION_IDS.includes(id) ? id : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/leadership/watcher-xanax?faction_id= — leadership-only
// Active members with unpaid watched hours (slot_start already in the past,
// and after their last payout's high-water mark), across all 3 factions when
// faction_id is omitted — same shape the userscript's Monthly Xanax call uses.
// ─────────────────────────────────────────────────────────────────────────────
export async function getDistributions(request, env) {
  try {
    const url = new URL(request.url);
    const factionIdParam = url.searchParams.get('faction_id');
    const factionId = factionIdParam ? validFactionId(factionIdParam) : null;
    if (factionIdParam && !factionId) return errorResponse('Invalid faction_id', 400);

    const cutoff = currentHourStart();
    let sql = `
      SELECT fm.torn_user_id, fm.username, fm.faction_id, COUNT(s.id) AS quantity
      FROM faction_members fm
      JOIN chain_watch_shifts s ON s.torn_user_id = fm.torn_user_id AND s.faction_id = fm.faction_id
      LEFT JOIN (
        SELECT torn_user_id, MAX(paid_up_to_slot_start) AS paid_up_to
        FROM watcher_xanax_distributions GROUP BY torn_user_id
      ) p ON p.torn_user_id = fm.torn_user_id
      WHERE fm.is_active = 1
        AND s.slot_start < ?
        AND s.slot_start > COALESCE(p.paid_up_to, 0)
    `;
    const binds = [cutoff];
    if (factionId) {
      sql += ' AND fm.faction_id = ?';
      binds.push(factionId);
    }
    sql += ' GROUP BY fm.torn_user_id, fm.username, fm.faction_id HAVING quantity > 0 ORDER BY quantity DESC';

    const { results } = await env.DB.prepare(sql).bind(...binds).all();

    return jsonResponse({ members: results || [], settings: { ...ITEM, base_quantity: 1 } });
  } catch (err) {
    console.error('getDistributions (watcher xanax) error:', err);
    return errorResponse('Failed to fetch watcher xanax distributions', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/leadership/watcher-xanax — leadership-only
// Body: { torn_user_id }. Recomputes the member's currently-owed hours
// server-side (rather than trusting a client-sent quantity) and advances
// their high-water mark to the latest included slot, so a payout always
// matches exactly what's owed as of now.
// ─────────────────────────────────────────────────────────────────────────────
export async function markDistribution(request, env, user) {
  try {
    const body = await request.json();
    const tornUserId = parseInt(body.torn_user_id, 10);
    if (!tornUserId) return errorResponse('Missing torn_user_id', 400);

    const cutoff = currentHourStart();
    const paidUpToRow = await env.DB.prepare(
      `SELECT MAX(paid_up_to_slot_start) AS paid_up_to FROM watcher_xanax_distributions WHERE torn_user_id = ?`
    ).bind(tornUserId).first();
    const paidUpTo = paidUpToRow?.paid_up_to || 0;

    const owed = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt, MAX(slot_start) AS max_slot FROM chain_watch_shifts
       WHERE torn_user_id = ? AND slot_start < ? AND slot_start > ?`
    ).bind(tornUserId, cutoff, paidUpTo).first();

    if (!owed?.cnt) return errorResponse('No unpaid watched hours for this member', 400);

    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(`
      INSERT INTO watcher_xanax_distributions
        (torn_user_id, hours_paid, paid_up_to_slot_start, given_by, given_by_username, given_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(tornUserId, owed.cnt, owed.max_slot, user.tornUserId, user.username, now).run();

    return jsonResponse({ message: 'Watcher xanax marked complete', quantity: owed.cnt });
  } catch (err) {
    console.error('markDistribution (watcher xanax) error:', err);
    return errorResponse('Failed to mark watcher xanax distribution', 500);
  }
}
