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

// Exact per-hour paid tracking (one row per paid slot) rather than a
// [from, to] interval — an interval can't coexist correctly with review
// gating below: a noted hour sitting inside an otherwise-paid interval
// would look "already paid" (and so permanently skip future checks) the
// moment it's later included or excluded, even though it was never
// actually counted.
const NOT_ALREADY_PAID = `
  NOT EXISTS (
    SELECT 1 FROM watcher_xanax_paid_slots p
    WHERE p.torn_user_id = s.torn_user_id AND p.slot_start = s.slot_start
  )
`;

// A shift with a leader's note (e.g. "late", "no-show") doesn't count until
// a leader reviews it — same idea as the raffle's per-entry review. No note
// at all auto-counts, same as before this existed.
const NOT_PENDING_REVIEW = `(s.note IS NULL OR s.xanax_review_decision = 'included')`;

// A gap of 3+ days with no watched hour at all splits one "episode" of
// chain-watching from the next — e.g. one chain's watch coverage from the
// next chain's, weeks later.
const TIMEFRAME_GAP_SECONDS = 3 * 86400;

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/leadership/watcher-xanax/timeframe?faction_id= — leadership-only
// Auto-suggests a date range for the Custom picker: every distinct watched
// hour for the faction (or all 3 factions combined if omitted) is split into
// contiguous episodes wherever a 3+ day gap appears, then the episode
// closest to now (zero if "now" falls inside one, e.g. an in-progress or
// scheduled watch) is returned as { from, to } — `to` is exclusive, one
// second past the episode's last watched hour.
// ─────────────────────────────────────────────────────────────────────────────
export async function getTimeframe(request, env) {
  try {
    const url = new URL(request.url);
    const factionIdParam = url.searchParams.get('faction_id');
    const factionId = factionIdParam ? validFactionId(factionIdParam) : null;
    if (factionIdParam && !factionId) return errorResponse('Invalid faction_id', 400);

    let sql = `SELECT DISTINCT slot_start FROM chain_watch_shifts`;
    const binds = [];
    if (factionId) {
      sql += ' WHERE faction_id = ?';
      binds.push(factionId);
    }
    sql += ' ORDER BY slot_start ASC';

    const { results } = await env.DB.prepare(sql).bind(...binds).all();
    const slots = (results || []).map(r => r.slot_start);
    if (!slots.length) return jsonResponse({ from: null, to: null });

    const segments = [];
    let segStart = slots[0];
    let segEnd = slots[0];
    for (let i = 1; i < slots.length; i++) {
      if (slots[i] - segEnd > TIMEFRAME_GAP_SECONDS) {
        segments.push({ start: segStart, end: segEnd });
        segStart = slots[i];
      }
      segEnd = slots[i];
    }
    segments.push({ start: segStart, end: segEnd });

    const nowTs = Math.floor(Date.now() / 1000);
    let best = segments[0];
    let bestDist = Infinity;
    for (const seg of segments) {
      const dist = nowTs < seg.start ? seg.start - nowTs : nowTs > seg.end ? nowTs - seg.end : 0;
      if (dist < bestDist) {
        bestDist = dist;
        best = seg;
      }
    }

    return jsonResponse({ from: best.start, to: best.end + 3600 });
  } catch (err) {
    console.error('getTimeframe (watcher xanax) error:', err);
    return errorResponse('Failed to detect timeframe', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/leadership/watcher-xanax?faction_id=&from=&to= — leadership-only
// Active members with unpaid, non-pending watched hours within [from, to) —
// unix seconds; omitting them covers all time. Across all 3 factions when
// faction_id is omitted — same shape the userscript's Monthly Xanax call
// uses. Also returns any noted hour in the same window still awaiting a
// leader's include/exclude decision (pendingReview) — those are excluded
// from quantity until resolved.
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

    const factionFilter = factionId ? ' AND fm.faction_id = ?' : '';
    const factionBind = factionId ? [factionId] : [];

    const { results } = await env.DB.prepare(`
      SELECT fm.torn_user_id, fm.username, fm.faction_id, COUNT(s.id) AS quantity
      FROM faction_members fm
      JOIN chain_watch_shifts s ON s.torn_user_id = fm.torn_user_id AND s.faction_id = fm.faction_id
      WHERE fm.is_active = 1
        AND s.slot_start >= ? AND s.slot_start < ?
        AND ${NOT_ALREADY_PAID}
        AND ${NOT_PENDING_REVIEW}
        ${factionFilter}
      GROUP BY fm.torn_user_id, fm.username, fm.faction_id HAVING quantity > 0 ORDER BY quantity DESC
    `).bind(rangeFrom, rangeTo, ...factionBind).all();

    const { results: pending } = await env.DB.prepare(`
      SELECT s.id AS shift_id, s.torn_user_id, fm.username, s.faction_id, s.slot_start, s.note
      FROM chain_watch_shifts s
      JOIN faction_members fm ON fm.torn_user_id = s.torn_user_id AND fm.faction_id = s.faction_id
      WHERE fm.is_active = 1
        AND s.slot_start >= ? AND s.slot_start < ?
        AND s.note IS NOT NULL AND s.xanax_review_decision IS NULL
        AND ${NOT_ALREADY_PAID}
        ${factionFilter}
      ORDER BY s.slot_start ASC
    `).bind(rangeFrom, rangeTo, ...factionBind).all();

    return jsonResponse({
      members: results || [],
      pendingReview: pending || [],
      settings: { ...ITEM, base_quantity: 1 },
      range: { from: rangeFrom, to: rangeTo },
    });
  } catch (err) {
    console.error('getDistributions (watcher xanax) error:', err);
    return errorResponse('Failed to fetch watcher xanax distributions', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/leadership/watcher-xanax/review — leadership-only
// Body: { shift_id, decision: 'included' | 'excluded' } — resolves one
// noted shift so it (stops) counting toward payable hours.
// ─────────────────────────────────────────────────────────────────────────────
export async function reviewShift(request, env, user) {
  try {
    const body = await request.json();
    const shiftId = parseInt(body.shift_id, 10);
    const decision = body.decision;
    if (!shiftId) return errorResponse('Missing shift_id', 400);
    if (!['included', 'excluded'].includes(decision)) {
      return errorResponse('decision must be "included" or "excluded"', 400);
    }

    const result = await env.DB.prepare(`
      UPDATE chain_watch_shifts
      SET xanax_review_decision = ?, xanax_reviewed_by = ?, xanax_reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(decision, user.tornUserId, shiftId).run();

    if (!result.meta.changes) return errorResponse('Shift not found', 404);
    return jsonResponse({ success: true });
  } catch (err) {
    console.error('reviewShift (watcher xanax) error:', err);
    return errorResponse('Failed to review shift', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/leadership/watcher-xanax — leadership-only
// Body: { torn_user_id, from?, to? }. Recomputes exactly what's owed for that
// member within [from, to) server-side (rather than trusting a client-sent
// quantity) — noted-but-unreviewed hours are left out, same as the GET —
// and records exactly those slots as paid.
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

    const { results: owedRows } = await env.DB.prepare(`
      SELECT s.slot_start FROM chain_watch_shifts s
      WHERE s.torn_user_id = ?
        AND s.slot_start >= ? AND s.slot_start < ?
        AND ${NOT_ALREADY_PAID}
        AND ${NOT_PENDING_REVIEW}
    `).bind(tornUserId, rangeFrom, rangeTo).all();

    const slots = (owedRows || []).map(r => r.slot_start);
    if (!slots.length) return errorResponse('No unpaid watched hours in that range for this member', 400);

    const now = Math.floor(Date.now() / 1000);
    const dist = await env.DB.prepare(`
      INSERT INTO watcher_xanax_distributions
        (torn_user_id, hours_paid, paid_from_slot_start, paid_up_to_slot_start, given_by, given_by_username, given_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `).bind(tornUserId, slots.length, slots[0], slots[slots.length - 1], user.tornUserId, user.username, now).first();

    const insertSlot = env.DB.prepare(
      `INSERT OR IGNORE INTO watcher_xanax_paid_slots (torn_user_id, slot_start, distribution_id) VALUES (?, ?, ?)`
    );
    const CHUNK = 50;
    for (let i = 0; i < slots.length; i += CHUNK) {
      await env.DB.batch(slots.slice(i, i + CHUNK).map(slotStart => insertSlot.bind(tornUserId, slotStart, dist.id)));
    }

    return jsonResponse({ message: 'Watcher xanax marked complete', quantity: slots.length });
  } catch (err) {
    console.error('markDistribution (watcher xanax) error:', err);
    return errorResponse('Failed to mark watcher xanax distribution', 500);
  }
}
