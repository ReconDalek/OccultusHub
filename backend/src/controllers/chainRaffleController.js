import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';

const FACTION_IDS = [33097, 9728, 9171];
const REMOVAL_MODES = ['all_tickets', 'single_ticket'];
const ANIMATION_STYLES = ['slot_machine', 'wheel', 'lotto_balls'];

function validFactionId(raw) {
  const id = parseInt(raw, 10);
  return FACTION_IDS.includes(id) ? id : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chain-watcher/raffle/rounds — leadership-only
// Pulls every claimed hour slot for the faction/window into a fresh ticket
// pool (one entry per slot, so more hours watched = proportionally more
// chances). A slot with a leader note is NOT auto-included — see
// reviewEntry below — everything else starts as 'auto'.
// ─────────────────────────────────────────────────────────────────────────────
export async function createRound(request, env, user) {
  try {
    const body = await request.json();
    const factionId = validFactionId(body.faction_id);
    if (!factionId) return errorResponse('Invalid or missing faction_id', 400);

    const periodStart = parseInt(body.period_start, 10);
    const periodEnd = parseInt(body.period_end, 10);
    if (!Number.isFinite(periodStart) || !Number.isFinite(periodEnd) || periodEnd <= periodStart) {
      return errorResponse('Invalid period_start/period_end', 400);
    }
    const drawCount = Math.max(1, parseInt(body.draw_count, 10) || 1);

    const round = await env.DB.prepare(
      `INSERT INTO chain_raffle_rounds (faction_id, period_start, period_end, draw_count, status, created_by)
       VALUES (?, ?, ?, ?, 'building', ?)
       RETURNING *`
    ).bind(factionId, periodStart, periodEnd, drawCount, user.userId).first();

    const { results: slots } = await env.DB.prepare(
      `SELECT s.torn_user_id, s.slot_start, s.note,
         COALESCE(
           (SELECT username FROM faction_members WHERE torn_user_id = s.torn_user_id AND faction_id = s.faction_id LIMIT 1),
           (SELECT username FROM faction_members WHERE torn_user_id = s.torn_user_id ORDER BY is_active DESC LIMIT 1)
         ) AS username
       FROM chain_watch_shifts s
       WHERE s.faction_id = ? AND s.slot_start >= ? AND s.slot_start < ?`
    ).bind(factionId, periodStart, periodEnd).all();

    if (slots?.length) {
      const stmt = env.DB.prepare(
        `INSERT INTO chain_raffle_entries (round_id, torn_user_id, username, slot_start, note, review_status)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      const CHUNK = 50;
      for (let i = 0; i < slots.length; i += CHUNK) {
        await env.DB.batch(slots.slice(i, i + CHUNK).map(s =>
          stmt.bind(round.id, s.torn_user_id, s.username, s.slot_start, s.note || null, s.note ? 'pending' : 'auto')
        ));
      }
    }

    return jsonResponse({ round, entriesPulled: slots?.length || 0 });
  } catch (err) {
    console.error('createRound error:', err);
    return errorResponse('Failed to create raffle round', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chain-watcher/raffle/rounds?faction_id=X — leadership-only
// Round history for a faction, newest first.
// ─────────────────────────────────────────────────────────────────────────────
export async function listRounds(request, env) {
  try {
    const url = new URL(request.url);
    const factionId = validFactionId(url.searchParams.get('faction_id'));
    if (!factionId) return errorResponse('Invalid or missing faction_id', 400);

    const { results } = await env.DB.prepare(
      `SELECT * FROM chain_raffle_rounds WHERE faction_id = ? ORDER BY created_at DESC LIMIT 30`
    ).bind(factionId).all();

    return jsonResponse({ rounds: results || [] });
  } catch (err) {
    console.error('listRounds error:', err);
    return errorResponse('Failed to list raffle rounds', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chain-watcher/raffle/rounds/:id — leadership-only
// Round detail: the round itself, every entry (so the UI can show pending
// notes needing review), a unique-watcher overview (slots per person,
// review-excluded ones not counted), and winners drawn so far.
// ─────────────────────────────────────────────────────────────────────────────
export async function getRound(request, env) {
  try {
    const { id } = new URL(request.url).pathname.match(/\/rounds\/(?<id>\d+)/)?.groups ?? {};
    if (!id) return errorResponse('Invalid round id', 400);

    const round = await env.DB.prepare(`SELECT * FROM chain_raffle_rounds WHERE id = ?`).bind(id).first();
    if (!round) return errorResponse('Round not found', 404);

    const { results: entries } = await env.DB.prepare(
      `SELECT * FROM chain_raffle_entries WHERE round_id = ? ORDER BY slot_start ASC`
    ).bind(id).all();

    const { results: overview } = await env.DB.prepare(
      `SELECT torn_user_id, username, COUNT(*) AS slots
       FROM chain_raffle_entries
       WHERE round_id = ? AND review_status != 'excluded'
       GROUP BY torn_user_id ORDER BY slots DESC, username ASC`
    ).bind(id).all();

    const { results: winners } = await env.DB.prepare(
      `SELECT * FROM chain_raffle_winners WHERE round_id = ? ORDER BY draw_number ASC`
    ).bind(id).all();

    return jsonResponse({ round, entries: entries || [], overview: overview || [], winners: winners || [] });
  } catch (err) {
    console.error('getRound error:', err);
    return errorResponse('Failed to fetch raffle round', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chain-watcher/raffle/entries/:id/review — leadership-only
// { decision: 'included' | 'excluded' } — resolves one noted entry.
// ─────────────────────────────────────────────────────────────────────────────
export async function reviewEntry(request, env, user) {
  try {
    const { id } = new URL(request.url).pathname.match(/\/entries\/(?<id>\d+)\/review/)?.groups ?? {};
    if (!id) return errorResponse('Invalid entry id', 400);

    const { decision } = await request.json();
    if (!['included', 'excluded'].includes(decision)) return errorResponse('decision must be "included" or "excluded"', 400);

    const result = await env.DB.prepare(
      `UPDATE chain_raffle_entries SET review_status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(decision, user.userId, id).run();

    if (!result.meta.changes) return errorResponse('Entry not found', 404);
    return jsonResponse({ success: true });
  } catch (err) {
    console.error('reviewEntry error:', err);
    return errorResponse('Failed to review entry', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chain-watcher/raffle/rounds/:id/draw — leadership-only
// { removal_mode, animation_style } — runs exactly ONE weighted draw against
// whatever tickets are still live (not excluded, and not already removed by
// an earlier draw this round — see `remove` below), records the winner, and
// applies removal_mode. Frontend calls this once per draw so each one gets
// its own animation beat; draw_count is just the round's stated intent, not
// enforced here (a leader can stop early or run extra draws if they want).
// ─────────────────────────────────────────────────────────────────────────────
export async function drawWinner(request, env, user) {
  try {
    const { id } = new URL(request.url).pathname.match(/\/rounds\/(?<id>\d+)\/draw/)?.groups ?? {};
    if (!id) return errorResponse('Invalid round id', 400);

    const body = await request.json().catch(() => ({}));
    const removalMode = REMOVAL_MODES.includes(body.removal_mode) ? body.removal_mode : 'all_tickets';
    const animationStyle = ANIMATION_STYLES.includes(body.animation_style) ? body.animation_style : 'slot_machine';

    const round = await env.DB.prepare(`SELECT * FROM chain_raffle_rounds WHERE id = ?`).bind(id).first();
    if (!round) return errorResponse('Round not found', 404);

    // The live ticket pool: every non-excluded, non-pending entry minus
    // whatever earlier draws this round have already removed (tracked via
    // chain_raffle_winners.winning_entry_id for single_ticket removals, or
    // by torn_user_id for anyone already won under all_tickets removal).
    const { results: pool } = await env.DB.prepare(
      `SELECT e.id, e.torn_user_id, e.username
       FROM chain_raffle_entries e
       WHERE e.round_id = ? AND e.review_status IN ('auto','included')
         AND e.torn_user_id NOT IN (
           SELECT torn_user_id FROM chain_raffle_winners WHERE round_id = ? AND removal_mode = 'all_tickets'
         )
         AND e.id NOT IN (
           SELECT winning_entry_id FROM chain_raffle_winners WHERE round_id = ? AND winning_entry_id IS NOT NULL
         )`
    ).bind(id, id, id).all();

    if (!pool?.length) return errorResponse('No tickets left in the pool', 400);

    const winningEntry = pool[Math.floor(Math.random() * pool.length)];

    const { count } = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM chain_raffle_winners WHERE round_id = ?`
    ).bind(id).first();
    const drawNumber = (count || 0) + 1;

    const winner = await env.DB.prepare(
      `INSERT INTO chain_raffle_winners (round_id, draw_number, torn_user_id, username, winning_entry_id, removal_mode, animation_style, drawn_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`
    ).bind(id, drawNumber, winningEntry.torn_user_id, winningEntry.username, winningEntry.id, removalMode, animationStyle, user.userId).first();

    if (round.status === 'building') {
      await env.DB.prepare(`UPDATE chain_raffle_rounds SET status = 'ready' WHERE id = ?`).bind(id).run();
    }

    // Remaining pool size after this draw — lets the frontend know whether
    // another draw is even possible.
    const remainingAfter = removalMode === 'all_tickets'
      ? pool.filter(p => p.torn_user_id !== winningEntry.torn_user_id).length
      : pool.length - 1;

    return jsonResponse({ winner, remainingTickets: remainingAfter });
  } catch (err) {
    console.error('drawWinner error:', err);
    return errorResponse('Failed to draw a winner', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chain-watcher/raffle/rounds/:id/complete — leadership-only
// Marks a round finished once the leader is done running draws for it.
// ─────────────────────────────────────────────────────────────────────────────
export async function completeRound(request, env) {
  try {
    const { id } = new URL(request.url).pathname.match(/\/rounds\/(?<id>\d+)\/complete/)?.groups ?? {};
    if (!id) return errorResponse('Invalid round id', 400);

    const result = await env.DB.prepare(
      `UPDATE chain_raffle_rounds SET status = 'completed' WHERE id = ?`
    ).bind(id).run();

    if (!result.meta.changes) return errorResponse('Round not found', 404);
    return jsonResponse({ success: true });
  } catch (err) {
    console.error('completeRound error:', err);
    return errorResponse('Failed to complete round', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/chain-watcher/raffle/rounds/:id — leadership-only
// Deletable at any status (including after draws) — this is an internal
// leadership tool, not a public audit trail, and a leader who confirms the
// delete should be able to clean up a misconfigured or test round regardless
// of how far it got. Cascades to its entries and any winners drawn.
// ─────────────────────────────────────────────────────────────────────────────
export async function deleteRound(request, env) {
  try {
    const { id } = new URL(request.url).pathname.match(/\/rounds\/(?<id>\d+)$/)?.groups ?? {};
    if (!id) return errorResponse('Invalid round id', 400);

    const round = await env.DB.prepare(`SELECT id FROM chain_raffle_rounds WHERE id = ?`).bind(id).first();
    if (!round) return errorResponse('Round not found', 404);

    await env.DB.prepare(`DELETE FROM chain_raffle_winners WHERE round_id = ?`).bind(id).run();
    await env.DB.prepare(`DELETE FROM chain_raffle_entries WHERE round_id = ?`).bind(id).run();
    await env.DB.prepare(`DELETE FROM chain_raffle_rounds WHERE id = ?`).bind(id).run();

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('deleteRound error:', err);
    return errorResponse('Failed to delete round', 500);
  }
}
