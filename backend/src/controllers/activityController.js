import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { getRandomApiKeyForFaction } from '../services/tornApiService.js';

const FACTION_IDS = [33097, 9728, 9171];
const TORN_API_URL = 'https://api.torn.com';

// Fetch cumulative gym energy for a faction at a specific Unix timestamp.
// The Torn API returns the contributor totals *as of* that point in time.
async function fetchGymEnergyAt(apiKey, timestamp) {
  const url = `${TORN_API_URL}/v2/faction/contributors?stat=gymenergy&cat=all&timestamp=${timestamp}&comment=OccHub`;
  const res = await fetch(url, { headers: { Authorization: `ApiKey ${apiKey}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.error || JSON.stringify(data.error));
  return data.contributors || [];
}

export async function getEnergyActivity(request, env) {
  try {
    const url = new URL(request.url);

    // Default period: start of current UTC month → now
    const now = Math.floor(Date.now() / 1000);
    const d = new Date();
    const defaultFrom = Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000);

    const fromTs = parseInt(url.searchParams.get('from') || defaultFrom, 10);
    const toTs   = parseInt(url.searchParams.get('to')   || now, 10);

    // Days in range for avg/day calculation
    const days = Math.max(1, (toTs - fromTs) / 86400);

    // For each faction: get a random key then make two separate timestamp calls
    const factionResults = await Promise.allSettled(
      FACTION_IDS.map(async (factionId) => {
        const apiKey = await getRandomApiKeyForFaction(env, factionId);
        if (!apiKey) throw new Error(`No API key for faction ${factionId}`);

        // Two separate calls — one for start of period, one for end of period
        const [atStart, atEnd] = await Promise.all([
          fetchGymEnergyAt(apiKey, fromTs),
          fetchGymEnergyAt(apiKey, toTs),
        ]);

        return { factionId, atStart, atEnd };
      })
    );

    const errors = factionResults
      .filter(r => r.status === 'rejected')
      .map(r => r.reason?.message);

    // Merge by user ID across all factions
    // For each member: sum (end_value - start_value) per faction — avoids double-counting
    // when a member switches factions mid-period
    const members = {};

    for (const result of factionResults) {
      if (result.status !== 'fulfilled') continue;
      const { atStart, atEnd } = result.value;

      // Index start values by user id
      const startMap = {};
      for (const c of atStart) startMap[c.id] = c.value || 0;

      for (const c of atEnd) {
        const startVal = startMap[c.id] || 0;
        const delta = Math.max(0, (c.value || 0) - startVal);
        if (delta === 0) continue;

        if (!members[c.id]) {
          members[c.id] = { id: c.id, username: c.username, energy: 0 };
        }
        members[c.id].energy += delta;
        if (c.username) members[c.id].username = c.username;
      }
    }

    const sorted = Object.values(members)
      .map(m => ({
        id:      m.id,
        username: m.username,
        energy:  m.energy,
        avg_day: Math.round(m.energy / days),
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
