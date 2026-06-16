import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { getRandomApiKeyForFaction } from '../services/tornApiService.js';
import { logInfo, logWarn, logError } from '../services/logger.js';

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
