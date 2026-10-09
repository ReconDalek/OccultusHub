import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { checkBotSecret } from './ocInactivityController.js';
import { getEligibleMembers } from './xanaxController.js';

// OD (overdose) item reimbursement tracking — the Discord bot detects OD logs
// in a channel, checks eligibility here (Adept+ by our own rank, never Torn's
// in-game rank — same rule OD Insurance and Rank Perks already use), and
// queues a pending reimbursement. Leadership marks each member complete
// (paid out, value locked in) or rejects them (e.g. the item was faction-
// supplied, so nothing is owed). Nothing here is Torn-API-driven — it's all
// our own record of what's actually been reimbursed.

async function getUnitPrice(env, itemName) {
  const row = await env.DB.prepare(`SELECT effective_price FROM item_prices_cache WHERE name = ?`).bind(itemName).first();
  return row?.effective_price ?? 0;
}

// ── GET /api/discord/od-reimbursements/check?torn_user_id= ───────────────────
export async function checkEligibilityForBot(request, env) {
  if (!checkBotSecret(request, env)) return errorResponse('Unauthorized', 401);
  try {
    const url = new URL(request.url);
    const tornUserId = parseInt(url.searchParams.get('torn_user_id'), 10);
    if (!tornUserId) return errorResponse('torn_user_id is required', 400);

    const member = await env.DB.prepare(
      `SELECT torn_user_id, username, faction_id, is_active FROM faction_members WHERE torn_user_id = ?`
    ).bind(tornUserId).first();

    if (!member || !member.is_active) {
      return jsonResponse({ eligible: false, reason: 'not_an_active_member' });
    }

    const eligible = await getEligibleMembers(env, member.faction_id);
    const match = eligible.find(m => m.torn_user_id === tornUserId);
    if (!match) {
      return jsonResponse({ eligible: false, reason: 'rank_too_low', faction_id: member.faction_id, username: member.username });
    }

    return jsonResponse({ eligible: true, rank: match.rank, faction_id: member.faction_id, username: member.username });
  } catch (e) {
    console.error('checkEligibilityForBot error:', e);
    return errorResponse('Failed to check eligibility: ' + e.message, 500);
  }
}

// ── POST /api/discord/od-reimbursements — create a pending entry ─────────────
// Body: { torn_user_id, item_name, quantity, discord_message_id, logged_at }
// faction_id/username are resolved server-side, not trusted from the bot.
export async function createReimbursementForBot(request, env) {
  if (!checkBotSecret(request, env)) return errorResponse('Unauthorized', 401);
  try {
    const body = await request.json().catch(() => ({}));
    const tornUserId = parseInt(body.torn_user_id, 10);
    if (!tornUserId) return errorResponse('torn_user_id is required', 400);

    const member = await env.DB.prepare(
      `SELECT username, faction_id FROM faction_members WHERE torn_user_id = ?`
    ).bind(tornUserId).first();
    if (!member) return errorResponse('Unknown member', 404);

    const itemName = body.item_name || 'Xanax';
    const quantity = parseInt(body.quantity, 10) || 1;
    const now = Math.floor(Date.now() / 1000);

    const { meta } = await env.DB.prepare(`
      INSERT INTO od_reimbursements
        (torn_user_id, username, faction_id, item_name, quantity, status, discord_message_id, logged_at, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).bind(
      tornUserId, member.username, member.faction_id, itemName, quantity,
      body.discord_message_id ?? null, body.logged_at ?? now, now
    ).run();

    return jsonResponse({ id: meta.last_row_id, torn_user_id: tornUserId, faction_id: member.faction_id });
  } catch (e) {
    console.error('createReimbursementForBot error:', e);
    return errorResponse('Failed to log reimbursement: ' + e.message, 500);
  }
}

// ── GET /api/discord/od-reimbursements/pending — tracker rebuild ─────────────
// One entry per member with pending items, aggregated by item name.
export async function getPendingForBot(request, env) {
  if (!checkBotSecret(request, env)) return errorResponse('Unauthorized', 401);
  try {
    const { results } = await env.DB.prepare(
      `SELECT torn_user_id, username, faction_id, item_name, SUM(quantity) AS quantity, COUNT(*) AS pending_count
       FROM od_reimbursements WHERE status = 'pending'
       GROUP BY torn_user_id, item_name
       ORDER BY faction_id, username`
    ).all();

    const byMember = new Map();
    for (const r of results || []) {
      if (!byMember.has(r.torn_user_id)) {
        byMember.set(r.torn_user_id, {
          torn_user_id: r.torn_user_id, username: r.username, faction_id: r.faction_id, items: [], pending_count: 0,
        });
      }
      const entry = byMember.get(r.torn_user_id);
      entry.items.push({ item_name: r.item_name, quantity: r.quantity });
      entry.pending_count += r.pending_count;
    }

    return jsonResponse({ members: [...byMember.values()] });
  } catch (e) {
    console.error('getPendingForBot error:', e);
    return errorResponse('Failed to load pending reimbursements: ' + e.message, 500);
  }
}

// ── POST /api/discord/od-reimbursements/complete — body { torn_user_id, completed_by } ─
// Marks every pending row for this member complete, pricing each item at its
// current effective_price (frozen into the row, not re-priced later).
export async function completeForBot(request, env) {
  if (!checkBotSecret(request, env)) return errorResponse('Unauthorized', 401);
  try {
    const body = await request.json().catch(() => ({}));
    const tornUserId = parseInt(body.torn_user_id, 10);
    if (!tornUserId) return errorResponse('torn_user_id is required', 400);

    const { results: pending } = await env.DB.prepare(
      `SELECT id, item_name, quantity, discord_message_id FROM od_reimbursements WHERE torn_user_id = ? AND status = 'pending'`
    ).bind(tornUserId).all();
    if (!pending.length) return jsonResponse({ updated: 0, total_value: 0, message_ids: [] });

    const priceCache = new Map();
    const now = Math.floor(Date.now() / 1000);
    let totalValue = 0;
    const updates = [];
    for (const row of pending) {
      if (!priceCache.has(row.item_name)) priceCache.set(row.item_name, await getUnitPrice(env, row.item_name));
      const unitPrice = priceCache.get(row.item_name);
      totalValue += unitPrice * row.quantity;
      updates.push(
        env.DB.prepare(
          `UPDATE od_reimbursements SET status = 'completed', completed_at = ?, completed_by = ?, unit_price_at_completion = ? WHERE id = ?`
        ).bind(now, body.completed_by ?? null, unitPrice, row.id)
      );
    }
    await env.DB.batch(updates);

    // So the bot can react on each original OD log message to show it's done.
    const messageIds = [...new Set(pending.map(r => r.discord_message_id).filter(Boolean))];

    return jsonResponse({ updated: pending.length, total_value: Math.round(totalValue), message_ids: messageIds });
  } catch (e) {
    console.error('completeForBot error:', e);
    return errorResponse('Failed to complete reimbursement: ' + e.message, 500);
  }
}

// ── POST /api/discord/od-reimbursements/reject — body { torn_user_id, rejected_by } ─
// No value recorded — for cases leadership determines don't qualify (e.g. the
// item was faction-supplied, so nothing is owed).
export async function rejectForBot(request, env) {
  if (!checkBotSecret(request, env)) return errorResponse('Unauthorized', 401);
  try {
    const body = await request.json().catch(() => ({}));
    const tornUserId = parseInt(body.torn_user_id, 10);
    if (!tornUserId) return errorResponse('torn_user_id is required', 400);

    const now = Math.floor(Date.now() / 1000);
    const { meta } = await env.DB.prepare(
      `UPDATE od_reimbursements SET status = 'rejected', completed_at = ?, completed_by = ? WHERE torn_user_id = ? AND status = 'pending'`
    ).bind(now, body.rejected_by ?? null, tornUserId).run();

    return jsonResponse({ updated: meta.changes ?? 0 });
  } catch (e) {
    console.error('rejectForBot error:', e);
    return errorResponse('Failed to reject reimbursement: ' + e.message, 500);
  }
}
