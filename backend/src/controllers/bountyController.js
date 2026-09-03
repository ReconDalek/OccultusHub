import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';

// "23:39:02 - 24/07/26 You placed 1x $300,001 bounties on Sahil007 for a cost of $450,002"
// One Discord message can contain many of these lines (one per bounty placed).
// The timestamp prefix is optional in the regex itself -- Torn's notification
// copy/paste sometimes drops it, or splits it onto its own line, or wraps the
// rest of the line mid-sentence. normalizeBountyText() below repairs the
// line-splitting before this ever runs; the missing-prefix case is handled
// after matching, by fillMissingTimestamps().
const LINE_RE = /(?:(\d{2}):(\d{2}):(\d{2})\s*-\s*(\d{2})\/(\d{2})\/(\d{2})\s+)?You placed\s+(\d+)x\s*\$([\d,]+)\s*bounties\s+on\s+(.+?)\s+for\s+a\s+cost\s+of\s+\$([\d,]+)/gi;

// A line holding only a timestamp, with the "You placed..." text pushed onto
// the next line -- alternates with RECORD_START_RE lines in some copy/pastes.
const TIMESTAMP_ONLY_RE = /^\d{2}:\d{2}:\d{2}\s*-\s*\d{2}\/\d{2}\/\d{2}\s*$/;
// A line that starts a new bounty record (optionally prefixed by its timestamp).
const RECORD_START_RE = /^(?:\d{2}:\d{2}:\d{2}\s*-\s*\d{2}\/\d{2}\/\d{2}\s+)?You placed\b/i;

// Discord nickname convention: "TornUsername [TornId]" — gives the placer
// exactly, no fuzzy matching needed.
const NICKNAME_RE = /^(.+?)\s*\[(\d+)\]$/;

function parseNum(s) {
  return parseInt(String(s).replace(/,/g, ''), 10);
}

// Repairs two copy/paste line-splitting patterns before regex matching:
//  1. A record wrapped mid-sentence onto a second line (e.g. the "$451,000"
//     / "bounties on ..." split) -- the continuation line doesn't start a new
//     record, so it gets appended onto the previous one.
//  2. A timestamp alone on its own line, with the record text on the next
//     line -- the orphaned timestamp is held and prepended to that next line.
function normalizeBountyText(text) {
  const rawLines = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const merged = [];
  let pendingTimestamp = null;

  for (const line of rawLines) {
    if (TIMESTAMP_ONLY_RE.test(line)) {
      pendingTimestamp = line;
      continue;
    }
    if (merged.length === 0 || RECORD_START_RE.test(line)) {
      merged.push(pendingTimestamp ? `${pendingTimestamp} ${line}` : line);
    } else {
      merged[merged.length - 1] += ` ${line}`;
    }
    pendingTimestamp = null;
  }

  return merged.join('\n');
}

// Rows with no timestamp of their own borrow the nearest neighboring row's
// timestamp (bounty dumps are one continuous logging session, so adjacent
// entries are usually minutes apart at most) -- preferring the following row,
// since an untimed row is most often a leading entry that lost its prefix.
// Falls back to the Discord message's own post time if no row in the batch
// has a real timestamp at all.
function fillMissingTimestamps(rows, fallbackTimestamp) {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].placed_at != null) continue;
    let source = null;
    for (let j = i + 1; j < rows.length; j++) {
      if (rows[j].placed_at != null) { source = rows[j].placed_at; break; }
    }
    if (source == null) {
      for (let j = i - 1; j >= 0; j--) {
        if (rows[j].placed_at != null) { source = rows[j].placed_at; break; }
      }
    }
    rows[i].placed_at = source ?? fallbackTimestamp ?? Math.floor(Date.now() / 1000);
    rows[i].estimated = true;
  }
}

// Returns an array of { placed_at, estimated, bounty_count, bounty_value, target_username, total_cost }
export function parseBountyLines(text, fallbackTimestamp = null) {
  const normalized = normalizeBountyText(text);
  const rows = [];
  let m;
  LINE_RE.lastIndex = 0;
  while ((m = LINE_RE.exec(normalized)) !== null) {
    const [, hh, mm, ss, day, month, yr, count, value, target, cost] = m;
    const placed_at = hh != null
      ? Math.floor(Date.UTC(2000 + parseInt(yr, 10), parseInt(month, 10) - 1, parseInt(day, 10), parseInt(hh, 10), parseInt(mm, 10), parseInt(ss, 10)) / 1000)
      : null;
    rows.push({
      placed_at,
      estimated: false,
      bounty_count: parseInt(count, 10),
      bounty_value: parseNum(value),
      target_username: target.trim(),
      total_cost: parseNum(cost),
    });
  }
  fillMissingTimestamps(rows, fallbackTimestamp);
  return rows;
}

async function resolveTargetFaction(env, username) {
  const row = await env.DB.prepare(
    `SELECT torn_user_id, faction_id FROM faction_members WHERE username=? COLLATE NOCASE`
  ).bind(username).first();
  return { target_torn_id: row?.torn_user_id ?? null, faction_id: row?.faction_id ?? null };
}

// Auto-assigns to whatever war was active for that faction at placement time —
// left null (unassigned) if none match, so leadership can assign it manually.
async function findMatchingWar(env, factionId, placedAt) {
  if (!factionId) return null;
  const row = await env.DB.prepare(
    `SELECT id FROM ranked_wars
     WHERE faction_id=? AND started_at IS NOT NULL AND started_at<=?
       AND (ended_at IS NULL OR ended_at>=?)
     ORDER BY started_at DESC LIMIT 1`
  ).bind(factionId, placedAt, placedAt).first();
  return row?.id ?? null;
}

// ── POST /api/discord/bounty-webhook — bot-facing, shared-secret auth ────────
// Not inside the /api/leadership/ auth block (no user JWT available to the bot).

export async function handleBountyWebhook(request, env) {
  try {
    const auth = request.headers.get('Authorization') || '';
    const expected = `Bearer ${env.BOUNTY_BOT_SECRET}`;
    if (!env.BOUNTY_BOT_SECRET || auth !== expected) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json().catch(() => ({}));
    const { discord_nickname, discord_message_id, message_content, message_created_at } = body;
    if (!message_content) return errorResponse('message_content is required', 400);

    const nickM = discord_nickname ? NICKNAME_RE.exec(discord_nickname.trim()) : null;
    const placer_username = nickM ? nickM[1].trim() : (discord_nickname || null);
    const placer_torn_id  = nickM ? parseInt(nickM[2], 10) : null;

    const lines = parseBountyLines(message_content, message_created_at ?? null);
    if (!lines.length) return jsonResponse({ inserted: 0, skipped: 0, estimated: 0, message: 'No bounty lines matched' });

    let inserted = 0, skipped = 0, estimated = 0;
    for (const line of lines) {
      const { target_torn_id, faction_id } = await resolveTargetFaction(env, line.target_username);
      const ranked_war_id = await findMatchingWar(env, faction_id, line.placed_at);

      const { meta } = await env.DB.prepare(
        `INSERT OR IGNORE INTO bounties
           (placed_at, placed_at_estimated, placer_torn_id, placer_username, target_username, target_torn_id,
            faction_id, ranked_war_id, bounty_count, bounty_value, total_cost, source, discord_message_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'discord', ?)`
      ).bind(
        line.placed_at, line.estimated ? 1 : 0, placer_torn_id, placer_username, line.target_username, target_torn_id,
        faction_id, ranked_war_id, line.bounty_count, line.bounty_value, line.total_cost, discord_message_id ?? null
      ).run();

      if (meta?.changes > 0) {
        inserted++;
        if (line.estimated) estimated++;
      } else {
        skipped++;
      }
    }

    return jsonResponse({ inserted, skipped, estimated });
  } catch (err) {
    console.error('handleBountyWebhook error:', err);
    return errorResponse('Failed to process bounty webhook', 500);
  }
}

// ── GET /api/leadership/bounties ──────────────────────────────────────────────

const SORTABLE_COLUMNS = new Set([
  'placed_at', 'placer_username', 'target_username', 'faction_id',
  'ranked_war_id', 'bounty_count', 'bounty_value', 'total_cost', 'paid',
]);

export async function getBounties(request, env) {
  try {
    const url = new URL(request.url);
    const warId    = url.searchParams.get('war_id');
    const factionId = url.searchParams.get('faction_id');
    const month    = url.searchParams.get('month'); // YYYY-MM
    const from     = url.searchParams.get('from');  // unix
    const to       = url.searchParams.get('to');    // unix
    const user     = url.searchParams.get('user');
    const paid     = url.searchParams.get('paid');  // '0' | '1'
    const sort     = SORTABLE_COLUMNS.has(url.searchParams.get('sort')) ? url.searchParams.get('sort') : 'placed_at';
    const dir      = url.searchParams.get('dir') === 'asc' ? 'ASC' : 'DESC';
    const limit    = Math.min(parseInt(url.searchParams.get('limit') || '200', 10), 500);

    const where = [];
    const binds = [];

    // war_id accepts a single id, 'none' (unassigned), or a comma-separated
    // mix of both (e.g. "none,178,176") — used by Bulk Pay to tally across
    // several wars (and/or unassigned bounties) at once.
    if (warId) {
      const tokens = warId.split(',').map(s => s.trim()).filter(Boolean);
      const hasNone = tokens.includes('none');
      const ids = tokens.filter(t => t !== 'none').map(t => parseInt(t, 10)).filter(Number.isFinite);
      const parts = [];
      if (hasNone) parts.push('b.ranked_war_id IS NULL');
      if (ids.length) parts.push(`b.ranked_war_id IN (${ids.map(() => '?').join(',')})`);
      if (parts.length) { where.push(`(${parts.join(' OR ')})`); binds.push(...ids); }
    }
    if (factionId) { where.push('b.faction_id=?'); binds.push(parseInt(factionId, 10)); }
    if (paid === '0' || paid === '1') { where.push('b.paid=?'); binds.push(parseInt(paid, 10)); }
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split('-').map(Number);
      const monthFrom = Math.floor(Date.UTC(y, m - 1, 1) / 1000);
      const monthTo   = Math.floor(Date.UTC(y, m, 1) / 1000) - 1;
      where.push('b.placed_at >= ? AND b.placed_at <= ?'); binds.push(monthFrom, monthTo);
    }
    if (from) { where.push('b.placed_at >= ?'); binds.push(parseInt(from, 10)); }
    if (to)   { where.push('b.placed_at <= ?'); binds.push(parseInt(to, 10)); }
    if (user) { where.push('(b.target_username LIKE ? OR b.placer_username LIKE ?)'); binds.push(`%${user}%`, `%${user}%`); }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { results } = await env.DB.prepare(
      `SELECT b.*, w.opponent_faction_name, w.started_at AS war_started_at, w.ended_at AS war_ended_at
       FROM bounties b
       LEFT JOIN ranked_wars w ON w.id = b.ranked_war_id
       ${whereClause}
       ORDER BY b.${sort} ${dir}
       LIMIT ?`
    ).bind(...binds, limit).all();

    return jsonResponse({ bounties: results || [] });
  } catch (err) {
    console.error('getBounties error:', err);
    return errorResponse('Failed to fetch bounties', 500);
  }
}

// ── POST /api/leadership/bounties — manual add ────────────────────────────────

export async function createBounty(request, env, user) {
  try {
    const body = await request.json().catch(() => ({}));
    const { placed_at, placer_username, placer_torn_id, target_username, bounty_count, bounty_value, total_cost, ranked_war_id, faction_id, notes } = body;
    if (!placed_at || !target_username || !total_cost) {
      return errorResponse('placed_at, target_username, and total_cost are required', 400);
    }

    // Auto-resolve faction/war unless explicitly overridden in the request.
    let resolvedFaction = faction_id ?? null;
    if (!resolvedFaction) {
      const r = await resolveTargetFaction(env, target_username);
      resolvedFaction = r.faction_id;
    }
    const resolvedWar = ranked_war_id ?? (await findMatchingWar(env, resolvedFaction, placed_at));

    const { meta } = await env.DB.prepare(
      `INSERT INTO bounties
         (placed_at, placer_torn_id, placer_username, target_username, target_torn_id,
          faction_id, ranked_war_id, bounty_count, bounty_value, total_cost, source, created_by, notes)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 'manual', ?, ?)`
    ).bind(
      placed_at, placer_torn_id ?? null, placer_username ?? null, target_username,
      resolvedFaction, resolvedWar, bounty_count ?? 1, bounty_value ?? total_cost, total_cost,
      user.userId, notes ?? null
    ).run();

    return jsonResponse({ id: meta.last_row_id });
  } catch (err) {
    console.error('createBounty error:', err);
    return errorResponse('Failed to create bounty', 500);
  }
}

// ── POST /api/leadership/bounties/parse-log — paste a log dump (same format
// the Discord bot detects) and either preview what it would add (dry_run) or
// commit it. Lets leadership bulk-add bounties without re-typing each one
// into the form -- e.g. logs that came in outside the bot's tracked channel. ─

export async function parseBountyLog(request, env, user) {
  try {
    const body = await request.json().catch(() => ({}));
    const { message_content, placer_username, placer_torn_id, dry_run } = body;
    if (!message_content) return errorResponse('message_content is required', 400);

    const lines = parseBountyLines(message_content, Math.floor(Date.now() / 1000));
    if (!lines.length) return jsonResponse({ rows: [], inserted: 0, skipped: 0, estimated: 0 });

    const resolvedPlacerTornId = Number.isFinite(placer_torn_id) ? placer_torn_id : (parseInt(placer_torn_id, 10) || null);

    const rows = [];
    let inserted = 0, skipped = 0, estimated = 0;

    for (const line of lines) {
      const { target_torn_id, faction_id } = await resolveTargetFaction(env, line.target_username);
      const ranked_war_id = await findMatchingWar(env, faction_id, line.placed_at);

      // Manual entries have no discord_message_id, so the table's own
      // UNIQUE(discord_message_id, placed_at, target_username) constraint
      // can't catch duplicates here (NULL != NULL in SQL) -- also catches
      // the same bounty already having come in through the Discord bot.
      const existing = await env.DB.prepare(
        `SELECT id FROM bounties WHERE placed_at=? AND target_username=? COLLATE NOCASE AND total_cost=?`
      ).bind(line.placed_at, line.target_username, line.total_cost).first();

      const row = {
        placed_at: line.placed_at,
        estimated: line.estimated,
        bounty_count: line.bounty_count,
        bounty_value: line.bounty_value,
        target_username: line.target_username,
        total_cost: line.total_cost,
        faction_id,
        ranked_war_id,
        duplicate: !!existing,
      };
      rows.push(row);

      if (line.estimated) estimated++;

      if (dry_run) continue;

      if (existing) {
        skipped++;
        continue;
      }

      await env.DB.prepare(
        `INSERT INTO bounties
           (placed_at, placed_at_estimated, placer_torn_id, placer_username, target_username, target_torn_id,
            faction_id, ranked_war_id, bounty_count, bounty_value, total_cost, source, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?)`
      ).bind(
        line.placed_at, line.estimated ? 1 : 0, resolvedPlacerTornId, placer_username ?? null,
        line.target_username, target_torn_id, faction_id, ranked_war_id,
        line.bounty_count, line.bounty_value, line.total_cost, user.userId
      ).run();
      inserted++;
    }

    return jsonResponse({ rows, inserted, skipped, estimated });
  } catch (err) {
    console.error('parseBountyLog error:', err);
    return errorResponse('Failed to parse bounty log', 500);
  }
}

// ── PUT /api/leadership/bounties/:id — edit (e.g. assign/reassign a war),
// or toggle `paid` (repaid-the-placer status) — sets paid_by/paid_at too. ────

export async function updateBounty(request, env, user) {
  try {
    const id = parseInt(request.url.match(/\/bounties\/(\d+)/)?.[1], 10);
    if (!id) return errorResponse('Invalid bounty id', 400);

    const body = await request.json().catch(() => ({}));
    const fields = ['placed_at', 'placer_username', 'placer_torn_id', 'target_username', 'faction_id', 'ranked_war_id', 'bounty_count', 'bounty_value', 'total_cost', 'notes'];
    const sets = [];
    const binds = [];
    for (const f of fields) {
      if (Object.prototype.hasOwnProperty.call(body, f)) { sets.push(`${f}=?`); binds.push(body[f]); }
    }
    // A manual correction to placed_at is by definition no longer an estimate.
    if (Object.prototype.hasOwnProperty.call(body, 'placed_at')) {
      sets.push('placed_at_estimated=0');
    }
    if (Object.prototype.hasOwnProperty.call(body, 'paid')) {
      const paid = body.paid ? 1 : 0;
      sets.push('paid=?', 'paid_by=?', 'paid_at=?');
      binds.push(paid, paid ? (user?.userId ?? null) : null, paid ? new Date().toISOString() : null);
    }
    if (!sets.length) return errorResponse('No fields to update', 400);

    await env.DB.prepare(`UPDATE bounties SET ${sets.join(', ')} WHERE id=?`).bind(...binds, id).run();
    return jsonResponse({ ok: true });
  } catch (err) {
    console.error('updateBounty error:', err);
    return errorResponse('Failed to update bounty', 500);
  }
}

// ── POST /api/leadership/bounties/bulk-paid — Bulk Pay: mark many bounty rows
// paid/unpaid in one shot (one lump-sum payment covers several individual
// bounty rows for the same placer). Body: { ids: number[], paid: boolean } ──

export async function bulkSetBountiesPaid(request, env, user) {
  try {
    const body = await request.json().catch(() => ({}));
    const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isFinite) : [];
    if (!ids.length) return errorResponse('ids array is required', 400);

    const paid = body.paid ? 1 : 0;
    const paidBy = paid ? (user?.userId ?? null) : null;
    const paidAt = paid ? new Date().toISOString() : null;

    const stmt = env.DB.prepare(`UPDATE bounties SET paid=?, paid_by=?, paid_at=? WHERE id=?`);
    await env.DB.batch(ids.map(id => stmt.bind(paid, paidBy, paidAt, id)));

    return jsonResponse({ ok: true, updated: ids.length });
  } catch (err) {
    console.error('bulkSetBountiesPaid error:', err);
    return errorResponse('Failed to bulk-update bounty paid status', 500);
  }
}

// ── DELETE /api/leadership/bounties/:id ───────────────────────────────────────

export async function deleteBounty(request, env) {
  try {
    const id = parseInt(request.url.match(/\/bounties\/(\d+)/)?.[1], 10);
    if (!id) return errorResponse('Invalid bounty id', 400);
    await env.DB.prepare(`DELETE FROM bounties WHERE id=?`).bind(id).run();
    return jsonResponse({ ok: true });
  } catch (err) {
    console.error('deleteBounty error:', err);
    return errorResponse('Failed to delete bounty', 500);
  }
}

// ── Accounting: this month's bounty spend NOT already attributed to a war ────
// War-attributed bounties (ranked_war_id set) are excluded here on purpose —
// those already reduce that specific war's own net_profit inside
// computeWarEconomics, and Accounting's war income already nets through that
// figure. Counting them again here would double-subtract the same expense.
// `monthStartTs`/`monthEndTs` (unix seconds) let accountingController ask
// about a past month instead of always the live current one — both default
// to the current calendar month when omitted, preserving prior behavior.
export async function getFactionBountyExpense(env, factionId, monthStartTs, monthEndTs) {
  const now = new Date();
  const start = monthStartTs ?? Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);
  const end   = monthEndTs   ?? Math.floor(now.getTime() / 1000);

  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS bounty_count, COALESCE(SUM(total_cost), 0) AS monthly_cost
     FROM bounties
     WHERE faction_id = ? AND ranked_war_id IS NULL AND placed_at >= ? AND placed_at <= ?`
  ).bind(factionId, start, end).first();

  return {
    bounty_count: row?.bounty_count ?? 0,
    monthly_cost: Math.round(row?.monthly_cost ?? 0),
    configured: true,
  };
}
