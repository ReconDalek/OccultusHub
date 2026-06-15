import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { getRandomApiKeyForFaction } from '../services/tornApiService.js';

const FACTION_IDS = [33097, 9728, 9171];
const TORN_API_URL = 'https://api.torn.com';

async function fetchGymEnergy(apiKey, factionId, timestamp = null) {
  let url = `${TORN_API_URL}/v2/faction/contributors?stat=gymenergy&cat=all&key=${apiKey}`;
  if (timestamp) url += `&timestamp=${timestamp}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching faction ${factionId}`);
  const data = await res.json();
  if (data.error) throw new Error(`Torn API: ${data.error.error || JSON.stringify(data.error)}`);
  return data.contributors || [];
}

export async function getEnergyActivity(request, env) {
  try {
    const url = new URL(request.url);

    // Default: start of current UTC month to now
    const now = Math.floor(Date.now() / 1000);
    const d = new Date();
    const defaultFrom = Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000);

    const fromTs = parseInt(url.searchParams.get('from') || defaultFrom, 10);
    const toTs   = parseInt(url.searchParams.get('to')   || now,         10);

    // Days in range for avg calculation
    const days = Math.max(1, (toTs - fromTs) / 86400);

    // Fetch one random API key per faction, then call baseline + current in parallel
    const factionResults = await Promise.allSettled(
      FACTION_IDS.map(async (factionId) => {
        const apiKey = await getRandomApiKeyForFaction(env, factionId);
        if (!apiKey) throw new Error(`No API key available for faction ${factionId}`);

        // baseline (at fromTs) and current (at toTs, or live if toTs ≈ now)
        const isLive = (now - toTs) < 120;
        const [baseline, current] = await Promise.all([
          fetchGymEnergy(apiKey, factionId, fromTs),
          isLive
            ? fetchGymEnergy(apiKey, factionId)
            : fetchGymEnergy(apiKey, factionId, toTs),
        ]);

        return { factionId, baseline, current };
      })
    );

    // Collect errors
    const errors = factionResults
      .filter(r => r.status === 'rejected')
      .map(r => r.reason?.message);

    // Merge contributors across factions by user ID
    // Map: tornUserId -> { username, baseline: total, current: total }
    const members = {};

    for (const result of factionResults) {
      if (result.status !== 'fulfilled') continue;
      const { factionId, baseline, current } = result.value;

      // Index baseline by user id
      const baselineMap = {};
      for (const c of baseline) baselineMap[c.id] = c.value || 0;

      for (const c of current) {
        const baseVal = baselineMap[c.id] || 0;
        const delta   = Math.max(0, (c.value || 0) - baseVal);
        if (delta === 0) continue; // skip no-activity

        if (!members[c.id]) {
          members[c.id] = { id: c.id, username: c.username, energy: 0 };
        }
        members[c.id].energy += delta;
        // Keep latest username in case they changed it
        if (c.username) members[c.id].username = c.username;
      }
    }

    const sorted = Object.values(members)
      .map(m => ({
        id:       m.id,
        username: m.username,
        energy:   m.energy,
        avg_day:  Math.round(m.energy / days),
      }))
      .sort((a, b) => b.energy - a.energy);

    return jsonResponse({
      members: sorted,
      period: { from: fromTs, to: toTs, days: Math.round(days * 10) / 10 },
      errors: errors.length ? errors : undefined,
    });
  } catch (error) {
    console.error('getEnergyActivity error:', error);
    return errorResponse('Failed to fetch energy activity', 500);
  }
}
