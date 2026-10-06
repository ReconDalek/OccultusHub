import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { getKickThresholdCounts } from './activityController.js';

// Organized Crime inactivity: members who go more than 24h without being in an
// OC. Each unbroken stretch out of an OC is one INSTANCE, counted in the month
// its 24h mark falls in, with its full length kept as days out. The Discord
// bot's original method (one DETECTION per 24h block) is returned alongside.
//
// A member can't join an OC during recruit (RECRUIT_DAYS from joining a faction,
// or from re-joining / moving between our factions), so the clock only starts
// after recruit plus a leeway (grace_days, 0–3) — they may be busy or asleep at
// the first check. Once they've had an OC, the clock starts from when it ended.

const FACTION_IDS = [33097, 9728, 9171];
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const THRESHOLD_MS = 24 * HOUR_MS;
const RECRUIT_DAYS = 3;
const DEFAULT_GRACE_DAYS = 2;

const utcDayMs = (date) => Date.parse(`${date}T00:00:00Z`);
const addDays = (date, n) => new Date(utcDayMs(date) + n * DAY_MS).toISOString().slice(0, 10);
const monthOf = (ms) => new Date(ms).toISOString().slice(0, 7);
const isoOrNull = (ms) => (ms == null ? null : new Date(ms).toISOString());

function parseGraceDays(url) {
  const raw = url.searchParams.get('grace_days');
  if (raw == null || raw === '') return DEFAULT_GRACE_DAYS;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 3 ? n : null;
}

// Consecutive registry days in the same faction form one membership run. A
// faction change or a gap of 2+ missing days starts a new run (recruit restarts).
// A single missed cron day inside a run is bridged, same as Activity's logic.
function buildRuns(rows, { earliestDate, latestDate, nowMs }) {
  const runs = [];
  let prev = null;
  for (const row of rows) {
    if (prev && prev.snapshot_date === row.snapshot_date) continue;
    const gapDays = prev ? Math.round((utcDayMs(row.snapshot_date) - utcDayMs(prev.snapshot_date)) / DAY_MS) : null;
    const continues = prev && prev.faction_id === row.faction_id && (gapDays === 1 || gapDays === 2);
    if (continues) runs[runs.length - 1].last = row.snapshot_date;
    else runs.push({ faction_id: row.faction_id, start: row.snapshot_date, last: row.snapshot_date });
    prev = row;
  }
  return runs.map(run => {
    const ongoing = run.last >= latestDate;
    return {
      ...run,
      ongoing,
      // Members already present when tracking began have no recognisable join
      // date, so don't assume they were recruits.
      preExisting: run.start === earliestDate,
      startMs: utcDayMs(run.start),
      endMs: ongoing ? nowMs : utcDayMs(run.last) + DAY_MS,
    };
  });
}

// Time inside [start, end) not covered by any busy interval (sorted by start).
function findGaps(start, end, busy, ongoing) {
  const gaps = [];
  let cursor = start;
  for (const b of busy) {
    if (cursor >= end) break;
    if (b.end <= cursor) continue;
    if (b.start >= end) break;
    if (b.start > cursor) gaps.push({ start: cursor, end: b.start, reason: 'joined' });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < end) gaps.push({ start: cursor, end, reason: ongoing ? 'ongoing' : 'left' });
  return gaps;
}

// Every faction member's out-of-OC instances across all recorded history.
// Heavy-ish (reads the full registry) but small in practice — the same read
// Activity's membership logic does for a single month.
async function computeInstances(env, graceDays, nowMs) {
  const [registryRes, slotRes, coverageRow, memberRes] = await Promise.all([
    env.DB.prepare(`
      SELECT torn_user_id, faction_id, snapshot_date
      FROM personal_stats_snapshots
      WHERE faction_id IN (?, ?, ?)
      GROUP BY torn_user_id, faction_id, snapshot_date
      ORDER BY torn_user_id, snapshot_date
    `).bind(...FACTION_IDS).all(),
    env.DB.prepare(`
      SELECT s.torn_user_id, s.joined_at, c.status, c.executed_at, c.expired_at
      FROM oc_crime_slots s
      JOIN oc_crimes c ON c.id = s.crime_id
      WHERE s.torn_user_id IS NOT NULL AND s.joined_at IS NOT NULL
    `).all(),
    env.DB.prepare(`SELECT MIN(created_at) AS earliest FROM oc_crimes`).first(),
    env.DB.prepare(`SELECT torn_user_id, username FROM faction_members`).all(),
  ]);

  const registry = registryRes.results || [];
  const usernameById = new Map((memberRes.results || []).map(m => [m.torn_user_id, m.username]));
  // Before the earliest recorded crime we can't see who was in an OC, so gaps
  // are only measured from there on. Oldest crime we hold = start of coverage.
  const coverageStartMs = coverageRow?.earliest ? coverageRow.earliest * 1000 : null;

  if (!registry.length) return { instances: [], coverageStartMs, latestDate: null };

  const dates = registry.map(r => r.snapshot_date);
  const latestDate = dates.reduce((a, b) => (a > b ? a : b));
  const earliestDate = dates.reduce((a, b) => (a < b ? a : b));

  // Busy = slot joined until the crime resolved. Recruiting/Planning crimes are
  // still in progress, so the member counts as busy up to now.
  const busyByUser = new Map();
  for (const s of slotRes.results || []) {
    const start = s.joined_at * 1000;
    const resolvedSec = (s.status === 'Successful' || s.status === 'Failure' || s.status === 'Expired')
      ? (s.executed_at ?? s.expired_at)
      : null;
    const end = Math.max(resolvedSec ? resolvedSec * 1000 : nowMs, start);
    if (!busyByUser.has(s.torn_user_id)) busyByUser.set(s.torn_user_id, []);
    busyByUser.get(s.torn_user_id).push({ start, end });
  }

  const rowsByUser = new Map();
  for (const r of registry) {
    if (!rowsByUser.has(r.torn_user_id)) rowsByUser.set(r.torn_user_id, []);
    rowsByUser.get(r.torn_user_id).push(r);
  }

  const instances = [];
  for (const [tornUserId, rows] of rowsByUser) {
    const busy = (busyByUser.get(tornUserId) || []).sort((a, b) => a.start - b.start);
    const username = usernameById.get(tornUserId) ?? null;

    for (const run of buildRuns(rows, { earliestDate, latestDate, nowMs })) {
      const eligibleMs = run.preExisting ? run.startMs : utcDayMs(addDays(run.start, RECRUIT_DAYS + graceDays));
      const windowStart = Math.max(eligibleMs, coverageStartMs ?? 0);
      if (run.endMs <= windowStart) continue;

      for (const gap of findGaps(windowStart, run.endMs, busy, run.ongoing)) {
        const length = gap.end - gap.start;
        if (length <= THRESHOLD_MS) continue;

        // One detection per full 24h of the stretch, starting at the 24h mark.
        const detections = [];
        for (let t = gap.start + THRESHOLD_MS; t <= gap.end; t += THRESHOLD_MS) detections.push(t);

        instances.push({
          torn_user_id: tornUserId,
          username,
          faction_id: run.faction_id,
          out_since: gap.start,
          detected_at: detections[0],
          ended_at: gap.end,
          end_reason: gap.reason, // joined | ongoing | left
          hours_out: length / HOUR_MS,
          detections,
        });
      }
    }
  }

  return { instances, coverageStartMs, latestDate };
}

function publicInstance(inst, detectionCount) {
  return {
    faction_id: inst.faction_id,
    out_since: isoOrNull(inst.out_since),
    detected_at: isoOrNull(inst.detected_at),
    ended_at: isoOrNull(inst.ended_at),
    end_reason: inst.end_reason,
    hours_out: Math.round(inst.hours_out * 10) / 10,
    detection_count: detectionCount,
  };
}

function monthsBetween(fromMs, toMs) {
  const months = [];
  const cursor = new Date(fromMs);
  cursor.setUTCDate(1);
  cursor.setUTCHours(0, 0, 0, 0);
  const last = monthOf(toMs);
  while (true) {
    const key = cursor.toISOString().slice(0, 7);
    months.unshift(key);
    if (key === last) break;
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

// ── GET /api/leadership/oc/inactivity?faction_id=&month=YYYY-MM&grace_days= ──
// Overview for one faction + UTC month: members detected, with instances
// (counted in the month they passed 24h) and bot-style detections per member.
export async function getInactivity(request, env, user) {
  try {
    const url = new URL(request.url);
    const factionId = parseInt(url.searchParams.get('faction_id'), 10);
    if (!FACTION_IDS.includes(factionId)) return errorResponse('Invalid or missing faction_id', 400);

    const nowMs = Date.now();
    const month = url.searchParams.get('month') || monthOf(nowMs);
    if (!/^\d{4}-\d{2}$/.test(month)) return errorResponse('month must be YYYY-MM', 400);

    const graceDays = parseGraceDays(url);
    if (graceDays === null) return errorResponse('grace_days must be 0–3', 400);

    const { instances, coverageStartMs } = await computeInstances(env, graceDays, nowMs);

    const memberMap = new Map();
    for (const inst of instances) {
      if (inst.faction_id !== factionId) continue;
      const monthDetections = inst.detections.filter(t => monthOf(t) === month);
      if (!monthDetections.length) continue;

      const countedHere = monthOf(inst.detected_at) === month;
      let entry = memberMap.get(inst.torn_user_id);
      if (!entry) {
        entry = {
          torn_user_id: inst.torn_user_id,
          username: inst.username,
          instance_count: 0,
          detection_count: 0,
          days_out: 0,
          instances: [],
        };
        memberMap.set(inst.torn_user_id, entry);
      }
      entry.detection_count += monthDetections.length;
      if (countedHere) {
        entry.instance_count += 1;
        entry.days_out += inst.hours_out / 24;
      }
      entry.instances.push({ ...publicInstance(inst, monthDetections.length), counted_this_month: countedHere });
    }

    const members = [...memberMap.values()]
      .map(m => ({ ...m, days_out: Math.round(m.days_out * 10) / 10 }))
      .sort((a, b) => b.instance_count - a.instance_count || b.detection_count - a.detection_count
        || (a.username || '').localeCompare(b.username || ''));
    for (const m of members) m.instances.sort((a, b) => (a.out_since < b.out_since ? 1 : -1));

    const totals = members.reduce((acc, m) => ({
      members: acc.members + 1,
      instances: acc.instances + m.instance_count,
      detections: acc.detections + m.detection_count,
      days_out: acc.days_out + m.days_out,
    }), { members: 0, instances: 0, detections: 0, days_out: 0 });
    totals.days_out = Math.round(totals.days_out * 10) / 10;

    // Members already warned for this month's OC type — same persistence idea
    // as the Energy/Chain/War generators' "✓ Warned" state.
    const [yearStr, monthStr] = month.split('-');
    const { results: warnedRows } = await env.DB.prepare(
      `SELECT DISTINCT torn_user_id FROM member_warnings WHERE warning_type = 'OC' AND period_year = ? AND period_month = ?`
    ).bind(Number(yearStr), Number(monthStr)).all();
    const warnedIds = new Set((warnedRows || []).map(r => r.torn_user_id));
    // Kick threshold = warnings in the trailing 6 complete months, all types —
    // same live count the Energy/Chain generators show.
    const kickCounts = await getKickThresholdCounts(env);
    for (const m of members) {
      m.already_warned = warnedIds.has(m.torn_user_id);
      m.kick_count_6mo = kickCounts[m.torn_user_id] ?? 0;
      m.at_kick_threshold = m.kick_count_6mo >= 3;
    }

    const { results: roster } = await env.DB.prepare(
      `SELECT torn_user_id, username FROM faction_members WHERE faction_id = ? AND is_active = 1 ORDER BY username ASC`
    ).bind(factionId).all();

    const months = coverageStartMs ? monthsBetween(coverageStartMs, nowMs) : [monthOf(nowMs)];

    return jsonResponse({
      faction_id: factionId,
      month,
      grace_days: graceDays,
      recruit_days: RECRUIT_DAYS,
      threshold_hours: 24,
      coverage_start: coverageStartMs ? new Date(coverageStartMs).toISOString().slice(0, 10) : null,
      months, // newest first
      totals,
      members,
      roster,
    });
  } catch (e) {
    console.error('getInactivity error:', e);
    return errorResponse('Failed to compute OC inactivity: ' + e.message, 500);
  }
}

// ── GET /api/leadership/oc/inactivity/member?torn_user_id=&grace_days= ───────
// Full out-of-OC history for one member across every faction they've been in.
export async function getMemberInactivity(request, env, user) {
  try {
    const url = new URL(request.url);
    const tornUserId = parseInt(url.searchParams.get('torn_user_id'), 10);
    if (!tornUserId) return errorResponse('torn_user_id is required', 400);

    const graceDays = parseGraceDays(url);
    if (graceDays === null) return errorResponse('grace_days must be 0–3', 400);

    const nowMs = Date.now();
    const { instances, coverageStartMs } = await computeInstances(env, graceDays, nowMs);
    const mine = instances.filter(i => i.torn_user_id === tornUserId);

    const byMonth = new Map();
    const bump = (month) => {
      if (!byMonth.has(month)) byMonth.set(month, { month, instances: 0, detections: 0, days_out: 0 });
      return byMonth.get(month);
    };
    for (const inst of mine) {
      for (const t of inst.detections) bump(monthOf(t)).detections += 1;
      const row = bump(monthOf(inst.detected_at));
      row.instances += 1;
      row.days_out += inst.hours_out / 24;
    }
    const monthly = [...byMonth.values()]
      .map(m => ({ ...m, days_out: Math.round(m.days_out * 10) / 10 }))
      .sort((a, b) => (a.month < b.month ? 1 : -1));

    const instanceList = mine
      .sort((a, b) => b.out_since - a.out_since)
      .map(i => publicInstance(i, i.detections.length));

    return jsonResponse({
      torn_user_id: tornUserId,
      username: mine[0]?.username ?? null,
      grace_days: graceDays,
      coverage_start: coverageStartMs ? new Date(coverageStartMs).toISOString().slice(0, 10) : null,
      monthly,
      instances: instanceList,
    });
  } catch (e) {
    console.error('getMemberInactivity error:', e);
    return errorResponse('Failed to load member OC inactivity: ' + e.message, 500);
  }
}
