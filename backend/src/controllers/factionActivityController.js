// ── Faction activity tracker ──────────────────────────────────────────────────
// Samples tracked factions every 30 minutes via Torn's public faction members
// data (one API call per faction returns every member's last_action), and
// stores per-member, per-30-minute activity so the /activity page can draw
// heatmaps, hourly breakdowns, faction-vs-faction comparisons and individual
// member patterns. Torn has no historical intraday activity endpoint (checked
// against the full v2 OpenAPI spec, 2026-10-04) — so this data can only exist
// from the moment a faction starts being tracked.
//
// Storage: activity_days — one row per faction per UTC day, JSON
//   { "<torn_user_id>": ["<name>", "<48 chars>"] }   (one char per 30-min slot)
//   '.' not sampled · '0' offline · '1' idle · '2' active (took an action)
// Chars compare in that order ('.' < '0' < '1' < '2'), so merging two
// observations of the same slot is just "keep the higher char".
//
// Accuracy: a sample marks the slot containing the member's last_action as
// active. Sampling once per slot (as close to its start as the cron allows)
// means "acted at least once in this slot" is captured exactly, except when a
// member acts in a slot and again in the next before that next sample runs —
// a few minutes' window at most. Idle = Torn showed them Idle/Online at sample
// time without an action in the slot.
//
// Hourly views are derived on the frontend: a member is active in an hour if
// they were active in either half.

import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';

const TORN_API_BASE   = 'https://api.torn.com/v2';
const SLOT_SECONDS    = 1800;
const SLOTS_PER_DAY   = 48;
const EMPTY_DAY       = '.'.repeat(SLOTS_PER_DAY);
const OWN_FACTIONS    = [33097, 9728, 9171];
const RUN_BUDGET      = 125;  // factions per cron run — */5 cron → up to 750 per 30-min slot
const CONCURRENCY     = 8;    // parallel Torn requests per run
const WAR_TRACK_DAYS  = 14;   // auto-tracked war opponents expire this long after the scheduled start
const RETAIN_DAYS     = 180;  // other factions' activity_days kept this long (own factions forever)
const MAX_RANGE_DAYS  = 62;
const MAX_BULK_ADD    = 1000;
const DISABLE_AFTER_BAD_ID = 3; // consecutive "Incorrect ID" errors before a faction is paused

// Torn error codes that mean the KEY is unusable (not the faction): drop the
// key for the rest of this run and retry the faction on another key.
// 2 incorrect key · 5 too many requests · 8 IP block · 10 owner in fed jail ·
// 13 key disabled (owner inactive) · 18 key paused
const BAD_KEY_CODES = new Set([2, 5, 8, 10, 13, 18]);

function tsToDay(ts) { return new Date(ts * 1000).toISOString().slice(0, 10); }
function slotIndex(ts) { return Math.floor((ts % 86400) / SLOT_SECONDS); }
function maxChar(a, b) { return a > b ? a : b; }
function setChar(str, idx, ch) { return str.slice(0, idx) + ch + str.slice(idx + 1); }

// ── API keys: any stored member key works (public endpoint) ──────────────────
async function loadKeyPool(env) {
  const { results } = await env.DB.prepare(
    `SELECT api_key FROM users WHERE api_key IS NOT NULL AND api_key != ''`
  ).all();
  const keys = [];
  for (const r of (results || [])) {
    try { keys.push(atob(r.api_key)); } catch { /* undecodable — skip */ }
  }
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  return keys;
}

// Round-robin over the pool; keys Torn rejects are dropped for the run.
function makeKeyRotator(keys) {
  const live = [...keys];
  let i = 0;
  return {
    next() { if (!live.length) return null; const k = live[i % live.length]; i++; return k; },
    drop(k) { const idx = live.indexOf(k); if (idx >= 0) live.splice(idx, 1); },
    get size() { return live.length; },
  };
}

async function fetchFactionSnapshot(factionId, rotator) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const key = rotator.next();
    if (!key) throw Object.assign(new Error('No usable API keys'), { noKeys: true });
    let data;
    try {
      const res = await fetch(
        `${TORN_API_BASE}/faction?id=${factionId}&selections=basic,members&striptags=true&comment=OccHub-activity`,
        { headers: { Authorization: `ApiKey ${key}` } }
      );
      if (!res.ok) { if (attempt < 2) continue; throw new Error(`HTTP ${res.status}`); }
      data = await res.json();
    } catch (e) {
      if (attempt < 2) continue;
      throw e;
    }
    if (data?.error) {
      if (BAD_KEY_CODES.has(data.error.code)) { rotator.drop(key); continue; }
      throw Object.assign(new Error(`Torn API error ${data.error.code}: ${data.error.error}`), { tornCode: data.error.code });
    }
    return data;
  }
  throw new Error('Torn API: retries exhausted');
}

// Merges one sample into the faction's day row(s). Returns the number of members seen.
export async function recordSample(env, factionId, data, now) {
  const members = Array.isArray(data?.members) ? data.members : Object.values(data?.members || {});
  const today = tsToDay(now);
  const curIdx = slotIndex(now);
  const slotStart = now - (now % SLOT_SECONDS);

  // Load today's row — plus yesterday's in the first slot of the day, since a
  // last_action from just before midnight belongs to yesterday's last slot.
  const days = [today];
  if (curIdx === 0) days.push(tsToDay(now - 86400));
  const rows = {};
  for (const day of days) {
    const row = await env.DB.prepare(`SELECT data FROM activity_days WHERE faction_id=? AND day=?`).bind(factionId, day).first();
    let parsed = {};
    try { parsed = row?.data ? JSON.parse(row.data) : {}; } catch { parsed = {}; }
    rows[day] = { data: parsed, dirty: !row };
  }

  for (const m of members) {
    const id = m.id;
    if (!id) continue;
    const name = m.name ?? '';
    const la = m.last_action?.timestamp ?? 0;
    const status = m.last_action?.status ?? 'Offline';

    const t = rows[today];
    const rec = (t.data[id] ??= [name, EMPTY_DAY]);
    if (rec[0] !== name && name) rec[0] = name;

    // Current slot: active if they've acted since it started, otherwise idle
    // if Torn shows a session (Online/Idle), otherwise offline.
    const cur = la >= slotStart ? '2' : (status === 'Offline' ? '0' : '1');
    const merged = maxChar(rec[1][curIdx], cur);
    if (merged !== rec[1][curIdx]) { rec[1] = setChar(rec[1], curIdx, merged); }
    t.dirty = true;

    // The slot their last action fell in was an active slot — but only fill it
    // if that slot was already sampled (char != '.'), so a slot from before we
    // started tracking never gets data for active members only (which would
    // inflate its percentage).
    if (la > 0 && la < slotStart) {
      const laDay = tsToDay(la);
      const target = rows[laDay];
      if (target && target.data[id]) {
        const laIdx = slotIndex(la);
        const s = target.data[id][1];
        if (s[laIdx] !== '.' && s[laIdx] !== '2') {
          target.data[id][1] = setChar(s, laIdx, '2');
          target.dirty = true;
        }
      }
    }
  }

  const writes = [];
  for (const [day, r] of Object.entries(rows)) {
    if (!r.dirty) continue;
    writes.push(env.DB.prepare(
      `INSERT INTO activity_days (faction_id, day, data, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(faction_id, day) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`
    ).bind(factionId, day, JSON.stringify(r.data), now));
  }
  if (writes.length) await env.DB.batch(writes);
  return members.length;
}

// ── Cron: */5 — sample every tracked faction once per 30-minute slot ─────────
export async function sampleFactionActivity(env) {
  const now = Math.floor(Date.now() / 1000);
  const slot = Math.floor(now / SLOT_SECONDS);

  const { results: due } = await env.DB.prepare(`
    SELECT faction_id, error_count FROM activity_factions
    WHERE is_active = 1 AND (last_slot IS NULL OR last_slot < ?)
    ORDER BY (source = 'own') DESC, COALESCE(last_sampled_at, 0) ASC
    LIMIT ?
  `).bind(slot, RUN_BUDGET).all();
  if (!due?.length) return { sampled: 0, failed: 0, due: 0 };

  const keys = await loadKeyPool(env);
  if (!keys.length) return { sampled: 0, failed: 0, due: due.length, error: 'no API keys' };
  const rotator = makeKeyRotator(keys);

  let sampled = 0, failed = 0, noKeys = false;
  for (let i = 0; i < due.length && !noKeys; i += CONCURRENCY) {
    const chunk = due.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(async (f) => {
      try {
        const data = await fetchFactionSnapshot(f.faction_id, rotator);
        const t = Math.floor(Date.now() / 1000);
        await recordSample(env, f.faction_id, data, t);
        const b = data.basic || {};
        await env.DB.prepare(`
          UPDATE activity_factions
          SET name = COALESCE(?, name), tag = COALESCE(?, tag), members = COALESCE(?, members),
              last_sampled_at = ?, last_slot = ?, last_error = NULL, error_count = 0
          WHERE faction_id = ?
        `).bind(b.name ?? null, b.tag ?? null, b.members ?? null, t, slot, f.faction_id).run();
        sampled++;
      } catch (e) {
        if (e.noKeys) { noKeys = true; return; } // leave last_slot alone — retried next run
        failed++;
        const badId = e.tornCode === 6 || e.tornCode === 7;
        const newCount = (f.error_count || 0) + 1;
        await env.DB.prepare(`
          UPDATE activity_factions
          SET last_slot = ?, last_error = ?, error_count = ?,
              is_active = CASE WHEN ? THEN 0 ELSE is_active END
          WHERE faction_id = ?
        `).bind(slot, String(e.message).slice(0, 200), newCount,
                badId && newCount >= DISABLE_AFTER_BAD_ID ? 1 : 0, f.faction_id).run().catch(() => {});
      }
    }));
  }
  return { sampled, failed, due: due.length, keys: keys.length, keysLeft: rotator.size, ...(noKeys ? { error: 'ran out of usable keys' } : {}) };
}

// ── Daily: prune old data, pause expired war-opponent tracking ───────────────
export async function pruneFactionActivity(env) {
  const now = Math.floor(Date.now() / 1000);
  const cutoff = tsToDay(now - RETAIN_DAYS * 86400);
  const ownPh = OWN_FACTIONS.map(() => '?').join(',');
  const del = await env.DB.prepare(
    `DELETE FROM activity_days WHERE day < ? AND faction_id NOT IN (${ownPh})`
  ).bind(cutoff, ...OWN_FACTIONS).run();
  const exp = await env.DB.prepare(
    `UPDATE activity_factions SET is_active = 0 WHERE source = 'war' AND is_active = 1 AND expires_at IS NOT NULL AND expires_at < ?`
  ).bind(now).run();
  return { daysDeleted: del.meta?.changes ?? 0, warExpired: exp.meta?.changes ?? 0 };
}

// Called by checkWarMatches when a new war is matched — starts tracking the
// opponent (or extends an existing war-sourced track). Manually tracked
// factions keep their 'manual' source and never expire.
export async function trackWarOpponent(env, factionId, name, scheduledStart) {
  if (!factionId || OWN_FACTIONS.includes(factionId)) return;
  const expires = (scheduledStart || Math.floor(Date.now() / 1000)) + WAR_TRACK_DAYS * 86400;
  await env.DB.prepare(`
    INSERT INTO activity_factions (faction_id, name, source, expires_at)
    VALUES (?, ?, 'war', ?)
    ON CONFLICT(faction_id) DO UPDATE SET
      is_active  = 1,
      name       = COALESCE(activity_factions.name, excluded.name),
      expires_at = CASE WHEN activity_factions.source = 'war'
                        THEN MAX(COALESCE(activity_factions.expires_at, 0), excluded.expires_at)
                        ELSE activity_factions.expires_at END
  `).bind(factionId, name ?? null, expires).run();
}

// ── HTTP: tracked factions ────────────────────────────────────────────────────

// GET /api/leadership/activity/factions
export async function listActivityFactions(request, env) {
  try {
    const { results } = await env.DB.prepare(`
      SELECT f.*,
             (SELECT MIN(day) FROM activity_days d WHERE d.faction_id = f.faction_id) AS first_day,
             (SELECT COUNT(*) FROM activity_days d WHERE d.faction_id = f.faction_id) AS days_stored
      FROM activity_factions f
      ORDER BY (f.source = 'own') DESC, f.is_active DESC, COALESCE(f.name, '') COLLATE NOCASE ASC
    `).all();
    return jsonResponse({ factions: results || [], own: OWN_FACTIONS });
  } catch (e) {
    return errorResponse('Failed to list tracked factions: ' + e.message, 500);
  }
}

// POST /api/leadership/activity/factions  body: { text } or { faction_ids: [] }
// Bulk add — accepts anything containing faction IDs: one per line, comma or
// space separated, or Torn profile URLs (…factions.php?step=profile&ID=123).
export async function addActivityFactions(request, env, user) {
  try {
    const body = await request.json();
    let ids = [];
    if (Array.isArray(body.faction_ids)) ids = body.faction_ids.map(Number);
    else if (typeof body.text === 'string') {
      // Prefer explicit ID=123 matches (URLs); otherwise every number in the text.
      const urlIds = [...body.text.matchAll(/ID=(\d+)/gi)].map(m => Number(m[1]));
      ids = urlIds.length ? urlIds : (body.text.match(/\d+/g) || []).map(Number);
    }
    ids = [...new Set(ids.filter(n => Number.isInteger(n) && n > 0 && n < 100000000))];
    if (!ids.length) return errorResponse('No faction IDs found', 400);
    if (ids.length > MAX_BULK_ADD) return errorResponse(`Too many IDs (max ${MAX_BULK_ADD} per add)`, 400);

    // Existing state, chunked to stay under D1's bound-parameter limit.
    const existing = {};
    for (let i = 0; i < ids.length; i += 90) {
      const chunk = ids.slice(i, i + 90);
      const { results } = await env.DB.prepare(
        `SELECT faction_id, is_active, source FROM activity_factions WHERE faction_id IN (${chunk.map(() => '?').join(',')})`
      ).bind(...chunk).all();
      for (const r of (results || [])) existing[r.faction_id] = r;
    }

    let added = 0, reactivated = 0, already = 0;
    const stmts = [];
    for (const id of ids) {
      const ex = existing[id];
      if (!ex) added++;
      else if (!ex.is_active || ex.source === 'war') reactivated++;
      else { already++; continue; }
      stmts.push(env.DB.prepare(`
        INSERT INTO activity_factions (faction_id, source, added_by) VALUES (?, 'manual', ?)
        ON CONFLICT(faction_id) DO UPDATE SET
          is_active = 1, error_count = 0, last_error = NULL, expires_at = NULL,
          source = CASE WHEN activity_factions.source = 'own' THEN 'own' ELSE 'manual' END
      `).bind(id, user?.userId ?? null));
    }
    for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
    return jsonResponse({ added, reactivated, already, total: ids.length });
  } catch (e) {
    return errorResponse('Failed to add factions: ' + e.message, 500);
  }
}

// PATCH /api/leadership/activity/factions/:id  body: { is_active }
export async function updateActivityFaction(request, env) {
  try {
    const id = parseInt(new URL(request.url).pathname.match(/\/activity\/factions\/(\d+)/)?.[1], 10);
    if (!id) return errorResponse('Invalid faction id', 400);
    const { is_active } = await request.json();
    await env.DB.prepare(
      `UPDATE activity_factions SET is_active = ?, error_count = 0, last_error = NULL WHERE faction_id = ?`
    ).bind(is_active ? 1 : 0, id).run();
    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse('Failed to update faction: ' + e.message, 500);
  }
}

// POST /api/leadership/activity/factions/remove  body: { faction_ids: [] }
// Removes factions from tracking AND deletes their stored activity. Our own
// factions can't be removed.
export async function removeActivityFactions(request, env) {
  try {
    const { faction_ids } = await request.json();
    const ids = [...new Set((faction_ids || []).map(Number))].filter(n => n > 0 && !OWN_FACTIONS.includes(n));
    if (!ids.length) return errorResponse('No removable factions given', 400);
    const stmts = [];
    for (const id of ids) {
      stmts.push(env.DB.prepare(`DELETE FROM activity_days WHERE faction_id = ?`).bind(id));
      stmts.push(env.DB.prepare(`DELETE FROM activity_factions WHERE faction_id = ?`).bind(id));
    }
    for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
    return jsonResponse({ removed: ids.length });
  } catch (e) {
    return errorResponse('Failed to remove factions: ' + e.message, 500);
  }
}

// ── HTTP: data ────────────────────────────────────────────────────────────────

// GET /api/leadership/activity/data?faction_id=X&from=YYYY-MM-DD&to=YYYY-MM-DD
// Raw per-member slot strings for the range — the frontend aggregates them
// into every view (faction heatmaps, hourly breakdowns, member detail), so
// one request serves the whole page for a faction.
export async function getActivityData(request, env) {
  try {
    const url = new URL(request.url);
    const factionId = parseInt(url.searchParams.get('faction_id'), 10);
    const from = url.searchParams.get('from');
    const to   = url.searchParams.get('to');
    if (!factionId) return errorResponse('faction_id required', 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '')) {
      return errorResponse('from and to (YYYY-MM-DD) required', 400);
    }
    const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 + 1;
    if (!(span >= 1) || span > MAX_RANGE_DAYS) return errorResponse(`Range must be 1–${MAX_RANGE_DAYS} days`, 400);

    const faction = await env.DB.prepare(
      `SELECT faction_id, name, tag, members, source, is_active, last_sampled_at,
              (SELECT MIN(day) FROM activity_days d WHERE d.faction_id = f.faction_id) AS first_day
       FROM activity_factions f WHERE faction_id = ?`
    ).bind(factionId).first();

    const { results } = await env.DB.prepare(
      `SELECT day, data FROM activity_days WHERE faction_id = ? AND day >= ? AND day <= ? ORDER BY day ASC`
    ).bind(factionId, from, to).all();

    // members: { id: { n: name, d: { day: "48 chars" } } }
    const members = {};
    for (const r of (results || [])) {
      let data = {};
      try { data = JSON.parse(r.data); } catch { continue; }
      for (const [id, [name, slots]] of Object.entries(data)) {
        const m = (members[id] ??= { n: name, d: {} });
        m.n = name || m.n;
        m.d[r.day] = slots;
      }
    }
    return jsonResponse({
      faction: faction || { faction_id: factionId },
      from, to,
      days_with_data: (results || []).map(r => r.day),
      members,
    });
  } catch (e) {
    return errorResponse('Failed to load activity data: ' + e.message, 500);
  }
}

// GET /api/leadership/activity/wars — our recent/upcoming ranked wars, for the
// War view (pre-war pattern comparison, then the war's own period).
export async function getActivityWars(request, env) {
  try {
    const now = Math.floor(Date.now() / 1000);
    const { results } = await env.DB.prepare(`
      SELECT rw.id, rw.faction_id, rw.opponent_faction_id, rw.opponent_faction_name, rw.status,
             rw.scheduled_start, rw.started_at, rw.ended_at, rw.result,
             af.is_active AS opponent_tracked,
             (SELECT MIN(day) FROM activity_days d WHERE d.faction_id = rw.opponent_faction_id) AS opponent_first_day
      FROM ranked_wars rw
      LEFT JOIN activity_factions af ON af.faction_id = rw.opponent_faction_id
      WHERE rw.status IN ('matched', 'active') OR COALESCE(rw.ended_at, 0) >= ?
      ORDER BY COALESCE(rw.started_at, rw.scheduled_start) DESC
      LIMIT 20
    `).bind(now - 30 * 86400).all();
    return jsonResponse({ wars: results || [] });
  } catch (e) {
    return errorResponse('Failed to load wars: ' + e.message, 500);
  }
}
