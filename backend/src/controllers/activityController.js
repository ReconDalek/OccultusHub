import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { getRandomApiKeyForFaction } from '../services/tornApiService.js';
import { logInfo, logWarn, logError } from '../services/logger.js';

// ── Personal stats field definitions ─────────────────────────────────────────
// Each entry: key (flat identifier), path (nested in personalstats), label, category
const PERSONAL_STAT_FIELDS = [
  { key: 'atk_won',       path: ['attacking','attacks','won'],                    label: 'Attacks Won',     category: 'attacking' },
  { key: 'atk_lost',      path: ['attacking','attacks','lost'],                   label: 'Attacks Lost',    category: 'attacking' },
  { key: 'def_won',       path: ['attacking','defends','won'],                    label: 'Defends Won',     category: 'attacking' },
  { key: 'def_lost',      path: ['attacking','defends','lost'],                   label: 'Defends Lost',    category: 'attacking' },
  { key: 'war_hits',      path: ['attacking','faction','ranked_war_hits'],        label: 'War Hits',        category: 'attacking' },
  { key: 'respect',       path: ['attacking','faction','respect'],                label: 'Faction Respect', category: 'attacking' },
  { key: 'raid_hits',     path: ['attacking','faction','raid_hits'],              label: 'Raid Hits',       category: 'attacking' },
  { key: 'wall_joins',    path: ['attacking','faction','territory','wall_joins'], label: 'Wall Joins',      category: 'attacking' },
  { key: 'revives',       path: ['hospital','reviving','revives'],                label: 'Revives Given',   category: 'support'   },
  { key: 'hosp',          path: ['hospital','times_hospitalized'],                label: 'Times Hosp.',     category: 'support'   },
  { key: 'busts',         path: ['jail','busts','success'],                       label: 'Jail Busts',      category: 'support'   },
  { key: 'crimes',        path: ['crimes','total'],                               label: 'Total Crimes',    category: 'crimes'    },
  { key: 'oc',            path: ['crimes','offenses','organized_crimes'],         label: 'Org. Crimes',     category: 'crimes'    },
  { key: 'travel',        path: ['travel','total'],                               label: 'Trips',           category: 'activity'  },
  { key: 'active_time',   path: ['other','activity','time'],                      label: 'Active Time (s)', category: 'activity'  },
  { key: 'drugs',         path: ['drugs','total'],                                label: 'Drugs Used',      category: 'activity'  },
  { key: 'bounties',      path: ['bounties','collected','amount'],                label: 'Bounties Coll.',  category: 'other'     },
  { key: 'networth',      path: ['networth','total'],                             label: 'Net Worth',       category: 'other'     },
];

function getPath(obj, pathArr) {
  return pathArr.reduce((curr, key) => curr?.[key], obj) ?? 0;
}

function extractStats(statsObj) {
  const out = {};
  for (const f of PERSONAL_STAT_FIELDS) out[f.key] = getPath(statsObj, f.path);
  return out;
}

// Round-robin key pool with per-key 60s rate limiting (max 45 calls/key/min)
class KeyPool {
  constructor(keys) {
    this.keys = keys.map(k => ({ ...k, used: 0, windowStart: Date.now() }));
    this.idx = 0;
  }
  async getKey() {
    const now = Date.now();
    for (const k of this.keys) {
      if (now - k.windowStart >= 60000) { k.used = 0; k.windowStart = now; }
    }
    for (let i = 0; i < this.keys.length; i++) {
      const k = this.keys[(this.idx + i) % this.keys.length];
      if (k.used < 45) {
        k.used++;
        this.idx = (this.idx + i + 1) % this.keys.length;
        return k;
      }
    }
    // All keys at limit — wait for earliest window to expire
    const earliest = Math.min(...this.keys.map(k => k.windowStart));
    const waitMs = 60000 - (Date.now() - earliest) + 500;
    console.log(`[personal stats] rate limit reached, waiting ${Math.round(waitMs / 1000)}s`);
    await new Promise(r => setTimeout(r, waitMs));
    return this.getKey();
  }
}

const FACTION_IDS = [33097, 9728, 9171];
const TORN_API_BASE = 'https://api.torn.com/v2';

// Fetch current gym energy contributors for a faction (cat=current = active members only).
async function fetchGymEnergy(apiKey) {
  const url = `${TORN_API_BASE}/faction/contributors?stat=gymenergy&cat=current&comment=OccHub`;
  const res = await fetch(url, { headers: { Authorization: `ApiKey ${apiKey}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.error || JSON.stringify(data.error));
  return data.contributors || [];
}

// Called by daily cron — snapshot current energy totals for all factions.
export async function takeEnergySnapshot(env) {
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD" UTC
  const now   = Math.floor(Date.now() / 1000);

  const results = await Promise.allSettled(
    FACTION_IDS.map(async (factionId) => {
      const apiKeyObj = await getRandomApiKeyForFaction(env, factionId);
      if (!apiKeyObj?.key) throw new Error(`No API key for faction ${factionId}`);

      const contributors = await fetchGymEnergy(apiKeyObj.key);
      console.log(`[energy snapshot] faction ${factionId}: ${contributors.length} members`);

      // Upsert each member — if a snapshot already exists for today, update it.
      const stmt = env.DB.prepare(`
        INSERT INTO energy_snapshots (torn_user_id, username, faction_id, energy_total, snapshot_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(torn_user_id, snapshot_date) DO UPDATE SET
          energy_total = excluded.energy_total,
          username     = excluded.username,
          faction_id   = excluded.faction_id
      `);

      await env.DB.batch(
        contributors.map(c => stmt.bind(c.id, c.username, factionId, c.value || 0, today, now))
      );

      return { factionId, count: contributors.length };
    })
  );

  // Purge snapshots older than 6 months
  await env.DB.prepare(
    `DELETE FROM energy_snapshots WHERE snapshot_date < date('now', '-6 months')`
  ).run();

  const summary = results.map(r =>
    r.status === 'fulfilled' ? r.value : { error: r.reason?.message }
  );
  const errors = results.filter(r => r.status === 'rejected').map(r => r.reason?.message);
  const totalSaved = results.filter(r => r.status === 'fulfilled').reduce((s, r) => s + r.value.count, 0);

  await logInfo(env, {
    category: 'cron', event: 'energy_snapshot',
    message: `Energy snapshot complete: ${totalSaved} members saved across ${FACTION_IDS.length} factions`,
    meta: { summary, errors: errors.length ? errors : undefined },
  });
  if (errors.length) {
    await logWarn(env, { category: 'cron', event: 'energy_snapshot_partial', message: `Energy snapshot errors: ${errors.join(', ')}`, meta: { errors } });
  }
  console.log('[energy snapshot] complete:', JSON.stringify(summary));
  return summary;
}

// GET /api/leadership/energy?from=YYYY-MM-DD&to=YYYY-MM-DD
// Diffs stored snapshots between two dates to calculate energy trained in that period.
export async function getEnergyActivity(request, env) {
  try {
    const url = new URL(request.url);

    // Default: start of current UTC month → today
    const nowDate = new Date();
    const defaultFrom = `${nowDate.getUTCFullYear()}-${String(nowDate.getUTCMonth() + 1).padStart(2, '0')}-01`;
    const defaultTo   = nowDate.toISOString().slice(0, 10);

    const fromDate = url.searchParams.get('from') || defaultFrom;
    const toDate   = url.searchParams.get('to')   || defaultTo;

    // Find the earliest snapshot on or after fromDate for each member,
    // and the latest snapshot on or before toDate. Diff = energy in period.
    const rows = await env.DB.prepare(`
      SELECT
        torn_user_id,
        MAX(username) AS username,
        MIN(CASE WHEN snapshot_date >= ? THEN energy_total END) AS start_energy,
        MAX(CASE WHEN snapshot_date <= ? THEN energy_total END) AS end_energy
      FROM energy_snapshots
      WHERE snapshot_date >= ? AND snapshot_date <= ?
      GROUP BY torn_user_id
      HAVING end_energy IS NOT NULL AND start_energy IS NOT NULL
         AND end_energy > start_energy
    `).bind(fromDate, toDate, fromDate, toDate).all();

    // Calculate days for avg/day
    const fromTs = Date.UTC(...fromDate.split('-').map((v, i) => i === 1 ? +v - 1 : +v)) / 1000;
    const toTs   = Date.UTC(...toDate.split('-').map((v, i) => i === 1 ? +v - 1 : +v)) / 1000;
    const days   = Math.max(1, (toTs - fromTs) / 86400);

    const members = (rows.results || [])
      .map(r => ({
        id:       r.torn_user_id,
        username: r.username,
        energy:   r.end_energy - r.start_energy,
        avg_day:  Math.round((r.end_energy - r.start_energy) / days),
      }))
      .sort((a, b) => b.energy - a.energy);

    // Check whether we have any snapshot data at all for this period
    const snapshotCheck = await env.DB.prepare(
      `SELECT MIN(snapshot_date) as earliest, MAX(snapshot_date) as latest, COUNT(DISTINCT snapshot_date) as days_covered
       FROM energy_snapshots WHERE snapshot_date >= ? AND snapshot_date <= ?`
    ).bind(fromDate, toDate).first();

    return jsonResponse({
      members,
      period: { from: fromDate, to: toDate, days: Math.round(days * 10) / 10 },
      coverage: snapshotCheck,
    });
  } catch (error) {
    console.error('getEnergyActivity error:', error);
    return errorResponse('Failed to fetch energy activity', 500);
  }
}

// ── Personal stats snapshot ───────────────────────────────────────────────────
// Called by daily cron — snapshots personalstats for every active faction member.
export async function takePersonalStatsSnapshot(env) {
  const today = new Date().toISOString().slice(0, 10);
  const now   = Math.floor(Date.now() / 1000);

  // All active members across all factions
  const memberRows = await env.DB.prepare(
    `SELECT torn_user_id, username, faction_id FROM faction_members WHERE is_active = 1`
  ).all();
  const members = memberRows.results || [];

  if (!members.length) {
    await logWarn(env, { category: 'cron', event: 'personal_stats_no_members', message: 'No active members for personal stats snapshot' });
    return;
  }

  // Load all registered API keys
  const keyRows = await env.DB.prepare(
    `SELECT api_key, torn_user_id, username FROM users WHERE api_key IS NOT NULL`
  ).all();
  const keys = (keyRows.results || []).map(r => {
    try { return { key: atob(r.api_key), tornUserId: r.torn_user_id, username: r.username }; }
    catch { return null; }
  }).filter(Boolean);

  if (!keys.length) {
    await logError(env, { category: 'cron', event: 'personal_stats_no_keys', message: 'No valid API keys for personal stats snapshot' });
    return;
  }

  const pool = new KeyPool(keys);
  let success = 0;
  let errors = 0;
  const errorDetails = [];

  for (const member of members) {
    const keyObj = await pool.getKey();
    try {
      const url = `${TORN_API_BASE}/user/${member.torn_user_id}/personalstats?cat=all&comment=OccHub`;
      const res = await fetch(url, { headers: { Authorization: `ApiKey ${keyObj.key}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error.error || JSON.stringify(data.error));

      await env.DB.prepare(`
        INSERT INTO personal_stats_snapshots (torn_user_id, username, faction_id, snapshot_date, stats, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(torn_user_id, snapshot_date) DO UPDATE SET
          stats      = excluded.stats,
          username   = excluded.username,
          faction_id = excluded.faction_id
      `).bind(member.torn_user_id, member.username, member.faction_id, today, JSON.stringify(data.personalstats), now).run();

      success++;
    } catch (e) {
      errors++;
      errorDetails.push({ id: member.torn_user_id, user: member.username, error: e.message });
    }
  }

  // Purge snapshots older than 6 months
  await env.DB.prepare(`DELETE FROM personal_stats_snapshots WHERE snapshot_date < date('now', '-6 months')`).run();

  // Single batch log entry for the whole run
  await logInfo(env, {
    category: 'cron', event: 'personal_stats_snapshot',
    message: `Personal stats snapshot: ${success}/${members.length} saved, ${errors} errors`,
    meta: {
      success, errors, total: members.length, keys_available: keys.length,
      errors_detail: errorDetails.length ? errorDetails.slice(0, 30) : undefined,
    },
  });
  if (errors) {
    await logWarn(env, {
      category: 'cron', event: 'personal_stats_snapshot_errors',
      message: `Personal stats: ${errors} members failed`,
      meta: { errors_detail: errorDetails.slice(0, 30) },
    });
  }

  console.log(`[personal stats] complete: ${success} saved, ${errors} errors`);
}

// ── Personal stats query ──────────────────────────────────────────────────────
// GET /api/leadership/personal-stats?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function getPersonalStats(request, env) {
  try {
    const url = new URL(request.url);
    const nowDate = new Date();
    const defaultFrom = `${nowDate.getUTCFullYear()}-${String(nowDate.getUTCMonth() + 1).padStart(2, '0')}-01`;
    const defaultTo   = nowDate.toISOString().slice(0, 10);
    const fromDate = url.searchParams.get('from') || defaultFrom;
    const toDate   = url.searchParams.get('to')   || defaultTo;

    // For each member: earliest snapshot in range = start baseline, latest = end value
    const startRows = await env.DB.prepare(`
      SELECT p.torn_user_id, p.username, p.faction_id, p.stats
      FROM personal_stats_snapshots p
      INNER JOIN (
        SELECT torn_user_id, MIN(snapshot_date) AS min_date
        FROM personal_stats_snapshots
        WHERE snapshot_date >= ? AND snapshot_date <= ?
        GROUP BY torn_user_id
      ) s ON p.torn_user_id = s.torn_user_id AND p.snapshot_date = s.min_date
    `).bind(fromDate, toDate).all();

    const endRows = await env.DB.prepare(`
      SELECT p.torn_user_id, p.stats
      FROM personal_stats_snapshots p
      INNER JOIN (
        SELECT torn_user_id, MAX(snapshot_date) AS max_date
        FROM personal_stats_snapshots
        WHERE snapshot_date >= ? AND snapshot_date <= ?
        GROUP BY torn_user_id
      ) e ON p.torn_user_id = e.torn_user_id AND p.snapshot_date = e.max_date
    `).bind(fromDate, toDate).all();

    // Index end rows by user id for fast lookup
    const endMap = new Map();
    for (const r of (endRows.results || [])) {
      try { endMap.set(r.torn_user_id, JSON.parse(r.stats)); } catch { /* skip */ }
    }

    const fromTs = Date.UTC(...fromDate.split('-').map((v, i) => i === 1 ? +v - 1 : +v));
    const toTs   = Date.UTC(...toDate.split('-').map((v, i) => i === 1 ? +v - 1 : +v));
    const days   = Math.max(1, (toTs - fromTs) / 86400000);

    const members = [];
    for (const r of (startRows.results || [])) {
      const endStats = endMap.get(r.torn_user_id);
      if (!endStats) continue;
      let startStats;
      try { startStats = JSON.parse(r.stats); } catch { continue; }

      const startExtracted = extractStats(startStats);
      const endExtracted   = extractStats(endStats);

      const delta = {};
      for (const f of PERSONAL_STAT_FIELDS) {
        delta[f.key] = Math.max(0, (endExtracted[f.key] || 0) - (startExtracted[f.key] || 0));
      }

      members.push({
        id:         r.torn_user_id,
        username:   r.username,
        faction_id: r.faction_id,
        stats:      delta,
      });
    }

    const coverage = await env.DB.prepare(
      `SELECT MIN(snapshot_date) AS earliest, MAX(snapshot_date) AS latest, COUNT(DISTINCT snapshot_date) AS days_covered
       FROM personal_stats_snapshots WHERE snapshot_date >= ? AND snapshot_date <= ?`
    ).bind(fromDate, toDate).first();

    return jsonResponse({
      members,
      fields: PERSONAL_STAT_FIELDS.map(f => ({ key: f.key, label: f.label, category: f.category })),
      period: { from: fromDate, to: toDate, days: Math.round(days * 10) / 10 },
      coverage,
    });
  } catch (error) {
    console.error('getPersonalStats error:', error);
    return errorResponse('Failed to fetch personal stats', 500);
  }
}

// ── Personal stats compare ────────────────────────────────────────────────────
// GET /api/leadership/personal-stats/compare?members=id1,id2&stat=war_hits&from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns per-day delta values for each requested member so the frontend can draw a line chart.
export async function getPersonalStatsCompare(request, env) {
  try {
    const url = new URL(request.url);
    const memberParam = url.searchParams.get('members') || '';
    const statKey     = url.searchParams.get('stat') || 'war_hits';
    const nowDate     = new Date();
    const defaultFrom = `${nowDate.getUTCFullYear()}-${String(nowDate.getUTCMonth() + 1).padStart(2, '0')}-01`;
    const defaultTo   = nowDate.toISOString().slice(0, 10);
    const fromDate    = url.searchParams.get('from') || defaultFrom;
    const toDate      = url.searchParams.get('to')   || defaultTo;

    const memberIds = memberParam.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n)).slice(0, 4);
    if (!memberIds.length) return errorResponse('No member IDs provided', 400);

    const field = PERSONAL_STAT_FIELDS.find(f => f.key === statKey);
    if (!field) return errorResponse(`Unknown stat key: ${statKey}`, 400);

    // Load every snapshot in range for the requested members
    const placeholders = memberIds.map(() => '?').join(',');
    const rows = await env.DB.prepare(`
      SELECT torn_user_id, username, faction_id, snapshot_date, stats
      FROM personal_stats_snapshots
      WHERE torn_user_id IN (${placeholders})
        AND snapshot_date >= ? AND snapshot_date <= ?
      ORDER BY torn_user_id ASC, snapshot_date ASC
    `).bind(...memberIds, fromDate, toDate).all();

    // Group by member
    const byMember = new Map();
    for (const r of (rows.results || [])) {
      if (!byMember.has(r.torn_user_id)) {
        byMember.set(r.torn_user_id, { id: r.torn_user_id, username: r.username, faction_id: r.faction_id, rows: [] });
      }
      byMember.get(r.torn_user_id).rows.push(r);
    }

    const series = [];
    for (const id of memberIds) {
      const member = byMember.get(id);
      if (!member) { series.push({ id, username: null, faction_id: null, points: [] }); continue; }

      let baseline = null;
      const points = [];
      for (const r of member.rows) {
        let statsObj;
        try { statsObj = JSON.parse(r.stats); } catch { continue; }
        const val = getPath(statsObj, field.path);
        if (baseline === null) baseline = val;
        points.push({ date: r.snapshot_date, delta: Math.max(0, val - baseline) });
      }

      series.push({ id: member.id, username: member.username, faction_id: member.faction_id, points });
    }

    return jsonResponse({
      series,
      stat: { key: field.key, label: field.label },
      period: { from: fromDate, to: toDate },
    });
  } catch (error) {
    console.error('getPersonalStatsCompare error:', error);
    return errorResponse('Failed to fetch comparison data', 500);
  }
}
