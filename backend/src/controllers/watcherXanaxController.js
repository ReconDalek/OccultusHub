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

// Each payout row records the [paid_from_slot_start, paid_up_to_slot_start]
// interval it covered, so arbitrary (and possibly out-of-order or
// overlapping) date-range payouts never double-pay or silently skip a gap —
// a slot only counts as paid if some prior payout's interval actually
// contains it, not just "anything before the newest payout".
const NOT_ALREADY_PAID = `
  NOT EXISTS (
    SELECT 1 FROM watcher_xanax_distributions d
    WHERE d.torn_user_id = s.torn_user_id
      AND s.slot_start >= d.paid_from_slot_start
      AND s.slot_start <= d.paid_up_to_slot_start
  )
`;

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/leadership/watcher-xanax?faction_id=&from=&to= — leadership-only
// Active members with unpaid watched hours (slot_start already in the past,
// and not already covered by a prior payout) within [from, to) — from/to are
// unix seconds; omitting them covers all time, same as before this filter
// existed. Across all 3 factions when faction_id is omitted — same shape the
// userscript's Monthly Xanax call uses.
// ─────────────────────────────────────────────────────────────────────────────
export async function getDistributions(request, env) {
  try {
    const url = new URL(request.url);
    const factionIdParam = url.searchParams.get('faction_id');
    const factionId = factionIdParam ? validFactionId(factionIdParam) : null;
    if (factionIdParam && !factionId) return errorResponse('Invalid faction_id', 400);

    const cutoff = currentHourStart();
    const fromParam = parseInt(url.searchParams.get('from'), 10);
    const toParam = parseInt(url.searchParams.get('to'), 10);
    const rangeFrom = Number.isFinite(fromParam) ? fromParam : 0;
    const rangeTo = Number.isFinite(toParam) ? Math.min(toParam, cutoff) : cutoff;

    let sql = `
      SELECT fm.torn_user_id, fm.username, fm.faction_id, COUNT(s.id) AS quantity
      FROM faction_members fm
      JOIN chain_watch_shifts s ON s.torn_user_id = fm.torn_user_id AND s.faction_id = fm.faction_id
      WHERE fm.is_active = 1
        AND s.slot_start >= ? AND s.slot_start < ?
        AND ${NOT_ALREADY_PAID}
    `;
    const binds = [rangeFrom, rangeTo];
    if (factionId) {
      sql += ' AND fm.faction_id = ?';
      binds.push(factionId);
    }
    sql += ' GROUP BY fm.torn_user_id, fm.username, fm.faction_id HAVING quantity > 0 ORDER BY quantity DESC';

    const { results } = await env.DB.prepare(sql).bind(...binds).all();

    return jsonResponse({
      members: results || [],
      settings: { ...ITEM, base_quantity: 1 },
      range: { from: rangeFrom, to: rangeTo },
    });
  } catch (err) {
    console.error('getDistributions (watcher xanax) error:', err);
    return errorResponse('Failed to fetch watcher xanax distributions', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/leadership/watcher-xanax — leadership-only
// Body: { torn_user_id, from?, to? }. Recomputes exactly what's owed for that
// member within [from, to) server-side (rather than trusting a client-sent
// quantity) and records that exact interval as paid — so a payout always
// matches exactly what's owed, scoped to the same range the client was shown.
// ─────────────────────────────────────────────────────────────────────────────
export async function markDistribution(request, env, user) {
  try {
    const body = await request.json();
    const tornUserId = parseInt(body.torn_user_id, 10);
    if (!tornUserId) return errorResponse('Missing torn_user_id', 400);

    const cutoff = currentHourStart();
    const fromParam = parseInt(body.from, 10);
    const toParam = parseInt(body.to, 10);
    const rangeFrom = Number.isFinite(fromParam) ? fromParam : 0;
    const rangeTo = Number.isFinite(toParam) ? Math.min(toParam, cutoff) : cutoff;

    const owed = await env.DB.prepare(`
      SELECT COUNT(*) AS cnt, MIN(slot_start) AS min_slot, MAX(slot_start) AS max_slot
      FROM chain_watch_shifts s
      WHERE s.torn_user_id = ?
        AND s.slot_start >= ? AND s.slot_start < ?
        AND ${NOT_ALREADY_PAID}
    `).bind(tornUserId, rangeFrom, rangeTo).first();

    if (!owed?.cnt) return errorResponse('No unpaid watched hours in that range for this member', 400);

    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(`
      INSERT INTO watcher_xanax_distributions
        (torn_user_id, hours_paid, paid_from_slot_start, paid_up_to_slot_start, given_by, given_by_username, given_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(tornUserId, owed.cnt, owed.min_slot, owed.max_slot, user.tornUserId, user.username, now).run();

    return jsonResponse({ message: 'Watcher xanax marked complete', quantity: owed.cnt });
  } catch (err) {
    console.error('markDistribution (watcher xanax) error:', err);
    return errorResponse('Failed to mark watcher xanax distribution', 500);
  }
}
