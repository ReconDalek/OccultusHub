import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { getKickThresholdCounts } from './activityController.js';

// Organized Crime inactivity: members not in any OC for more than 24h.
//
// An instance starts at the first 24h mark of an unbroken stretch out of an OC.
// Each full 24h of that stretch is one day. A period (a day, a range or a month)
// includes an instance if it has at least one day inside the period, and counts
// only the days that fall inside it.
//
// Recruit: a member can't join an OC during their first RECRUIT_DAYS in a faction
// (also after re-joining or moving between our factions). The clock starts after
// recruit plus a leeway (grace_days, 0–3). After an OC, the clock starts when it
// ended. Nothing is stored: this is derived per request from OC slot history and
// daily membership snapshots.

const FACTION_IDS = [33097, 9728, 9171];
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const THRESHOLD_MS = 24 * HOUR_MS;
const RECRUIT_DAYS = 3;
const DEFAULT_GRACE_DAYS = 2;

const utcDayMs = (date) => Date.parse(`${date}T00:00:00Z`);
const addDays = (date, n) => new Date(utcDayMs(date) + n * DAY_MS).toISOString().slice(0, 10);
const dateOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const monthOf = (ms) => new Date(ms).toISOString().slice(0, 7);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(utcDayMs(s));

// Last day of a YYYY-MM month (day 0 of the following month index).
function monthEnd(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function parseGraceDays(url) {
  const raw = url.searchParams.get('grace_days');
  if (raw == null || raw === '') return DEFAULT_GRACE_DAYS;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 3 ? n : null;
}

// Consecutive registry days in the same faction form one membership run. A
// faction change or a gap of 2+ missing days starts a new run (recruit restarts).
// A single missed cron day inside a run is bridged.
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
      // Members already present on the first tracked day have no known join date,
      // so no recruit period is assumed for them.
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

// Every member's out-of-OC instances across tracked history. Membership tracking
// starts at the earliest registry date, so nothing is counted before it.
async function computeInstances(env, graceDays, nowMs) {
  const [registryRes, slotRes, memberRes] = await Promise.all([
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
    env.DB.prepare(`SELECT torn_user_id, username FROM faction_members`).all(),
  ]);

  const registry = registryRes.results || [];
  if (!registry.length) return { instances: [], membershipStart: null, latestDate: null };

  const usernameById = new Map((memberRes.results || []).map(m => [m.torn_user_id, m.username]));
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

  const membershipStartMs = utcDayMs(earliestDate);
  const instances = [];
  for (const [tornUserId, rows] of rowsByUser) {
    const busy = (busyByUser.get(tornUserId) || []).sort((a, b) => a.start - b.start);
    const username = usernameById.get(tornUserId) ?? null;

    for (const run of buildRuns(rows, { earliestDate, latestDate, nowMs })) {
      const eligibleMs = run.preExisting ? run.startMs : utcDayMs(addDays(run.start, RECRUIT_DAYS + graceDays));
      const windowStart = Math.max(eligibleMs, membershipStartMs);
      if (run.endMs <= windowStart) continue;

      for (const gap of findGaps(windowStart, run.endMs, busy, run.ongoing)) {
        const length = gap.end - gap.start;
        if (length <= THRESHOLD_MS) continue;

        // One day per full 24h of the stretch, starting at the first 24h mark.
        const detections = [];
        for (let t = gap.start + THRESHOLD_MS; t <= gap.end; t += THRESHOLD_MS) detections.push(t);

        instances.push({
          torn_user_id: tornUserId,
          username,
          faction_id: run.faction_id,
          out_since: gap.start,
          ended_at: gap.end,
          end_reason: gap.reason, // joined | ongoing | left
          detections,
        });
      }
    }
  }

  return { instances, membershipStart: earliestDate, latestDate };
}

// An instance's days and dates inside [fromMs, endExclMs), or null if none.
function clipInstance(inst, fromMs, endExclMs) {
  const days = inst.detections.filter(t => t >= fromMs && t < endExclMs).length;
  if (!days) return null;
  return {
    faction_id: inst.faction_id,
    from: dateOf(Math.max(inst.out_since, fromMs)),
    to: dateOf(Math.min(inst.ended_at, endExclMs - 1)),
    days,
    ongoing: inst.end_reason === 'ongoing',
  };
}

// Newest-first list of YYYY-MM months from membership start to now.
function membershipMonths(membershipStart, nowMs) {
  const months = [];
  const last = monthOf(nowMs);
  let key = membershipStart.slice(0, 7);
  while (key <= last) {
    months.push(key);
    const [y, m] = key.split('-').map(Number);
    key = monthOf(Date.UTC(y, m, 1));
  }
  return months.reverse();
}

// Period from query params: from & to (YYYY-MM-DD; a single day if they match),
// or month=YYYY-MM. Defaults to the current month. The start is clamped to when
// membership tracking began.
function resolvePeriod(url, nowMs, membershipStart) {
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const month = url.searchParams.get('month');

  let start, end;
  if (from || to) {
    if ((from && !isDate(from)) || (to && !isDate(to))) return { error: 'from and to must be YYYY-MM-DD' };
    start = from || to;
    end = to || from;
  } else {
    const m = month || monthOf(nowMs);
    if (!/^\d{4}-\d{2}$/.test(m)) return { error: 'month must be YYYY-MM' };
    start = `${m}-01`;
    end = monthEnd(m);
  }
  if (start > end) return { error: 'from must be on or before to' };

  const wholeMonth = start.endsWith('-01') && end === monthEnd(start.slice(0, 7)) ? start.slice(0, 7) : null;
  // Entirely before membership tracking: keep the requested dates so the empty result still reads correctly.
  const clampedStart = membershipStart && start < membershipStart && end >= membershipStart ? membershipStart : start;
  return {
    from: clampedStart,
    to: end,
    wholeMonth,
    requested: { from: start, to: end },
  };
}

// ── GET /api/leadership/oc/inactivity ─────────────────────────────────────────
// Params: faction_id; month=YYYY-MM, or from & to (YYYY-MM-DD); grace_days 0–3.
export async function getInactivity(request, env, user) {
  try {
    const url = new URL(request.url);
    const factionId = parseInt(url.searchParams.get('faction_id'), 10);
    if (!FACTION_IDS.includes(factionId)) return errorResponse('Invalid or missing faction_id', 400);

    const graceDays = parseGraceDays(url);
    if (graceDays === null) return errorResponse('grace_days must be 0–3', 400);

    const nowMs = Date.now();
    const { instances, membershipStart } = await computeInstances(env, graceDays, nowMs);
    const period = resolvePeriod(url, nowMs, membershipStart);
    if (period.error) return errorResponse(period.error, 400);

    const months = membershipStart ? membershipMonths(membershipStart, nowMs) : [monthOf(nowMs)];
    const fromMs = utcDayMs(period.from);
    const endExclMs = utcDayMs(period.to) + DAY_MS;
    const outsideTracking = !membershipStart || period.to < membershipStart;

    const memberMap = new Map();
    if (!outsideTracking) {
      for (const inst of instances) {
        if (inst.faction_id !== factionId) continue;
        const clipped = clipInstance(inst, fromMs, endExclMs);
        if (!clipped) continue;
        let entry = memberMap.get(inst.torn_user_id);
        if (!entry) {
          entry = { torn_user_id: inst.torn_user_id, username: inst.username, instance_count: 0, days: 0, instances: [] };
          memberMap.set(inst.torn_user_id, entry);
        }
        entry.instance_count += 1;
        entry.days += clipped.days;
        entry.instances.push({ from: clipped.from, to: clipped.to, days: clipped.days, ongoing: clipped.ongoing });
      }
    }

    const members = [...memberMap.values()].sort((a, b) =>
      b.days - a.days || b.instance_count - a.instance_count || (a.username || '').localeCompare(b.username || ''));
    for (const m of members) m.instances.sort((a, b) => (a.from < b.from ? 1 : -1));

    const totals = members.reduce((acc, m) => ({
      members: acc.members + 1,
      instances: acc.instances + m.instance_count,
      days: acc.days + m.days,
    }), { members: 0, instances: 0, days: 0 });

    // Warned and kick status only apply to a whole calendar month (Generate OC view).
    if (period.wholeMonth && members.length) {
      const [yearStr, monthStr] = period.wholeMonth.split('-');
      const { results: warnedRows } = await env.DB.prepare(
        `SELECT DISTINCT torn_user_id FROM member_warnings WHERE warning_type = 'OC' AND period_year = ? AND period_month = ?`
      ).bind(Number(yearStr), Number(monthStr)).all();
      const warnedIds = new Set((warnedRows || []).map(r => r.torn_user_id));
      const kickCounts = await getKickThresholdCounts(env);
      for (const m of members) {
        m.already_warned = warnedIds.has(m.torn_user_id);
        m.kick_count_6mo = kickCounts[m.torn_user_id] ?? 0;
        m.at_kick_threshold = m.kick_count_6mo >= 3;
      }
    }

    const { results: roster } = await env.DB.prepare(
      `SELECT torn_user_id, username FROM faction_members WHERE faction_id = ? AND is_active = 1 ORDER BY username ASC`
    ).bind(factionId).all();

    return jsonResponse({
      faction_id: factionId,
      from: period.from,
      to: period.to,
      requested_from: period.requested.from,
      requested_to: period.requested.to,
      month: period.wholeMonth,
      grace_days: graceDays,
      membership_start: membershipStart,
      months,
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
// One member's full history across every faction they've been in.
export async function getMemberInactivity(request, env, user) {
  try {
    const url = new URL(request.url);
    const tornUserId = parseInt(url.searchParams.get('torn_user_id'), 10);
    if (!tornUserId) return errorResponse('torn_user_id is required', 400);

    const graceDays = parseGraceDays(url);
    if (graceDays === null) return errorResponse('grace_days must be 0–3', 400);

    const nowMs = Date.now();
    const { instances, membershipStart } = await computeInstances(env, graceDays, nowMs);
    const mine = instances.filter(i => i.torn_user_id === tornUserId);

    // Per month: days = detections in that month; instances = instances with a day in it.
    const byMonth = new Map();
    for (const inst of mine) {
      for (const t of inst.detections) {
        const key = monthOf(t);
        if (!byMonth.has(key)) byMonth.set(key, { month: key, instances: new Set(), days: 0 });
        const row = byMonth.get(key);
        row.days += 1;
        row.instances.add(inst);
      }
    }
    const monthly = [...byMonth.values()]
      .map(row => ({ month: row.month, instances: row.instances.size, days: row.days }))
      .sort((a, b) => (a.month < b.month ? 1 : -1));

    const endExclMs = nowMs + DAY_MS;
    const instanceList = mine
      .map(i => clipInstance(i, 0, endExclMs))
      .filter(Boolean)
      .sort((a, b) => (a.from < b.from ? 1 : -1));

    return jsonResponse({
      torn_user_id: tornUserId,
      username: mine[0]?.username ?? null,
      grace_days: graceDays,
      membership_start: membershipStart,
      monthly,
      instances: instanceList,
    });
  } catch (e) {
    console.error('getMemberInactivity error:', e);
    return errorResponse('Failed to load member OC inactivity: ' + e.message, 500);
  }
}
