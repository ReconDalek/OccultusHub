import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { PERSONAL_STAT_FIELDS, extractStats } from './activityController.js';

const LEADERBOARD_TYPES = ['faction', 'social', 'event', 'mug'];

// Current month caps at yesterday — today's snapshot can't exist until
// tomorrow's cron runs (personal_stats_snapshots is already stamped with the
// date its data represents). Past months use their real last day.
function monthBounds(year, month) {
  const now = new Date();
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const isCurrentMonth = year === now.getUTCFullYear() && month === (now.getUTCMonth() + 1);
  const monthEnd = isCurrentMonth
    ? new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    : `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { monthStart, monthEnd };
}

function statValue(rawStats, statKey) {
  try {
    return extractStats(JSON.parse(rawStats))[statKey] ?? 0;
  } catch {
    return 0;
  }
}

// Baseline is the last snapshot strictly BEFORE the month starts (the "last
// day of the previous month" the user described) — not the first snapshot
// inside the month, which would make that day's own gain invisible (same
// baseline-before-period pattern used for energy/company breakdowns). Falls
// back to the member's own first-in-month snapshot only when they have no
// prior data at all (new member), giving them 0 gain for that first day.
async function computeLeaderboard(env, config) {
  // Deactivated boards track nothing — same as unconfigured — rather than
  // continuing to show whatever month/stat was last set.
  if (!config?.active || !config?.stat_key || !config?.year || !config?.month) {
    return { entries: [], stat: null, last_updated: null };
  }
  const field = PERSONAL_STAT_FIELDS.find(f => f.key === config.stat_key);
  if (!field) return { entries: [], stat: null, last_updated: null };

  const { monthStart, monthEnd } = monthBounds(config.year, config.month);

  const [baselineRows, firstRows, currentRows] = await Promise.all([
    env.DB.prepare(`
      SELECT torn_user_id, stats FROM (
        SELECT torn_user_id, stats,
               ROW_NUMBER() OVER (PARTITION BY torn_user_id ORDER BY snapshot_date DESC) AS rn
        FROM personal_stats_snapshots
        WHERE snapshot_date < ?
      ) WHERE rn = 1
    `).bind(monthStart).all(),
    env.DB.prepare(`
      SELECT torn_user_id, stats FROM (
        SELECT torn_user_id, stats,
               ROW_NUMBER() OVER (PARTITION BY torn_user_id ORDER BY snapshot_date ASC) AS rn
        FROM personal_stats_snapshots
        WHERE snapshot_date >= ? AND snapshot_date <= ?
      ) WHERE rn = 1
    `).bind(monthStart, monthEnd).all(),
    env.DB.prepare(`
      SELECT torn_user_id, username, faction_id, stats, created_at FROM (
        SELECT torn_user_id, username, faction_id, stats, created_at,
               ROW_NUMBER() OVER (PARTITION BY torn_user_id ORDER BY snapshot_date DESC) AS rn
        FROM personal_stats_snapshots
        WHERE snapshot_date >= ? AND snapshot_date <= ?
      ) WHERE rn = 1
    `).bind(monthStart, monthEnd).all(),
  ]);

  const baselineMap = {};
  for (const r of baselineRows.results || []) baselineMap[r.torn_user_id] = statValue(r.stats, field.key);
  const firstMap = {};
  for (const r of firstRows.results || []) firstMap[r.torn_user_id] = statValue(r.stats, field.key);

  const entries = [];
  let lastUpdated = null; // most recent snapshot backing this board, i.e. when the standings were last refreshed
  for (const r of currentRows.results || []) {
    if (r.created_at && (!lastUpdated || r.created_at > lastUpdated)) lastUpdated = r.created_at;
    const current = statValue(r.stats, field.key);
    const baseline = baselineMap[r.torn_user_id] ?? firstMap[r.torn_user_id] ?? current;
    const gained = current - baseline;
    if (gained > 0) {
      entries.push({ torn_user_id: r.torn_user_id, username: r.username, faction_id: r.faction_id, gained });
    }
  }
  entries.sort((a, b) => b.gained - a.gained);

  return {
    entries,
    stat: { key: field.key, label: field.label, category: field.category },
    last_updated: lastUpdated ? lastUpdated * 1000 : null, // created_at is stored as unix seconds
  };
}

// GET /api/leadership/leaderboards — config + computed standings + stat picker metadata
export async function getLeaderboardConfigs(request, env) {
  try {
    const { results } = await env.DB.prepare(`SELECT * FROM leaderboard_config`).all();

    const configs = {};
    const leaderboards = {};
    for (const type of LEADERBOARD_TYPES) {
      const config = (results || []).find(r => r.type === type) ?? { type, stat_key: null, year: null, month: null, active: 1 };
      configs[type] = config;
      leaderboards[type] = await computeLeaderboard(env, config);
    }

    const available_stats = PERSONAL_STAT_FIELDS.map(f => ({ key: f.key, label: f.label, category: f.category }));

    return jsonResponse({ configs, leaderboards, available_stats });
  } catch (e) {
    return errorResponse('Failed to fetch leaderboards: ' + e.message, 500);
  }
}

// PUT /api/leadership/leaderboards/:type — body: { stat_key, year, month }
// Saving a stat/month always (re)activates the board — picking what to
// track is how you turn it back on after disabling it.
export async function updateLeaderboardConfig(request, env, user) {
  try {
    const type = request.url.match(/\/leaderboards\/(\w+)/)?.[1];
    if (!LEADERBOARD_TYPES.includes(type)) return errorResponse('Invalid leaderboard type', 400);

    const body = await request.json().catch(() => ({}));
    const { stat_key, year, month } = body;
    if (!stat_key || !PERSONAL_STAT_FIELDS.some(f => f.key === stat_key)) {
      return errorResponse('Invalid stat_key', 400);
    }
    if (!year || !month || month < 1 || month > 12) {
      return errorResponse('Valid year and month (1-12) are required', 400);
    }

    await env.DB.prepare(`
      INSERT INTO leaderboard_config (type, stat_key, year, month, active, updated_by, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(type) DO UPDATE SET
        stat_key = excluded.stat_key, year = excluded.year, month = excluded.month,
        active = 1, updated_by = excluded.updated_by, updated_at = excluded.updated_at
    `).bind(type, stat_key, year, month, user.userId).run();

    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to update leaderboard config: ' + e.message, 500);
  }
}

// POST /api/leadership/leaderboards/:type/active — body: { active: boolean }
// Toggles tracking on/off without touching the stored stat/month, so
// re-enabling later doesn't require re-picking them.
export async function setLeaderboardActive(request, env, user) {
  try {
    const type = request.url.match(/\/leaderboards\/(\w+)\/active/)?.[1];
    if (!LEADERBOARD_TYPES.includes(type)) return errorResponse('Invalid leaderboard type', 400);

    const body = await request.json().catch(() => ({}));
    const active = body.active ? 1 : 0;

    await env.DB.prepare(`
      INSERT INTO leaderboard_config (type, active, updated_by, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(type) DO UPDATE SET
        active = excluded.active, updated_by = excluded.updated_by, updated_at = excluded.updated_at
    `).bind(type, active, user.userId).run();

    return jsonResponse({ success: true, active: !!active });
  } catch (e) {
    return errorResponse('Failed to update leaderboard active state: ' + e.message, 500);
  }
}

// GET /api/leaderboards — PUBLIC (Discord bot + anything else). ?type=faction
// for a single board, omit for all three.
export async function getPublicLeaderboards(request, env) {
  try {
    const url = new URL(request.url);
    const typeParam = url.searchParams.get('type');
    if (typeParam && !LEADERBOARD_TYPES.includes(typeParam)) {
      return errorResponse('Invalid leaderboard type', 400);
    }
    const types = typeParam ? [typeParam] : LEADERBOARD_TYPES;

    const { results } = await env.DB.prepare(
      `SELECT * FROM leaderboard_config WHERE type IN (${types.map(() => '?').join(',')})`
    ).bind(...types).all();

    const out = {};
    for (const type of types) {
      const config = (results || []).find(r => r.type === type) ?? { type, stat_key: null, year: null, month: null, active: 1 };
      const { entries, stat, last_updated } = await computeLeaderboard(env, config);
      out[type] = {
        stat, year: config.year, month: config.month, last_updated,
        entries: entries.map((e, i) => ({ rank: i + 1, username: e.username, faction_id: e.faction_id, gained: e.gained })),
      };
    }

    return jsonResponse(typeParam ? out[typeParam] : out);
  } catch (e) {
    return errorResponse('Failed to fetch leaderboards: ' + e.message, 500);
  }
}
