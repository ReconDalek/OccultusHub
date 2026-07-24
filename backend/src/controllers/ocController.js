import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { getStaffApiKeyForFaction, fetchWithRetry } from '../services/tornApiService.js';

const FACTION_IDS = [33097, 9728, 9171];
const TORN_API_BASE = 'https://api.torn.com/v2';
const MAX_PAGES = 5; // 500 crimes per faction per run — plenty of headroom over a day's activity

// Torn's raw status strings map to our 3 display buckets
function statusBucket(status) {
  if (status === 'Recruiting') return 'recruiting';
  if (status === 'Planning') return 'planning';
  return 'completed'; // Successful | Failure | Expired
}

// ── Cron: fetch + cache all crimes for all 3 factions ────────────────────────
export async function fetchAndCacheFactionCrimes(env) {
  const results = { fetched: 0, crimesUpserted: 0, errors: [] };

  for (const factionId of FACTION_IDS) {
    try {
      const apiKeyObj = await getStaffApiKeyForFaction(env, factionId);
      if (!apiKeyObj?.key) {
        results.errors.push({ factionId, error: 'No API key available for this faction' });
        continue;
      }

      let crimeUpserts = [];
      let slotUpserts = [];
      let cprUpserts = new Map(); // key = `${torn_user_id}|${crime_name}|${position}` -> { rate, seenAt } (keep max per run)

      for (let page = 0; page < MAX_PAGES; page++) {
        const offset = page * 100;
        const data = await fetchWithRetry(
          `${TORN_API_BASE}/faction/crimes?cat=all&offset=${offset}&sort=DESC&comment=OccHub`,
          { Authorization: `ApiKey ${apiKeyObj.key}` }
        );

        const crimes = data?.crimes || [];
        if (!crimes.length) break;

        for (const crime of crimes) {
          crimeUpserts.push(env.DB.prepare(
            `INSERT INTO oc_crimes
               (id, faction_id, previous_crime_id, name, difficulty, status,
                created_at, planning_at, executed_at, ready_at, expired_at, rewards_json, fetched_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(id) DO UPDATE SET
               status = excluded.status,
               planning_at = excluded.planning_at,
               executed_at = excluded.executed_at,
               ready_at = excluded.ready_at,
               expired_at = excluded.expired_at,
               rewards_json = excluded.rewards_json,
               fetched_at = CURRENT_TIMESTAMP`
          ).bind(
            crime.id, factionId, crime.previous_crime_id ?? null, crime.name, crime.difficulty ?? null, crime.status,
            crime.created_at ?? null, crime.planning_at ?? null, crime.executed_at ?? null,
            crime.ready_at ?? null, crime.expired_at ?? null, crime.rewards ? JSON.stringify(crime.rewards) : null
          ));

          for (const slot of crime.slots || []) {
            const posInfo = slot.position_info || {};
            slotUpserts.push(env.DB.prepare(
              `INSERT INTO oc_crime_slots
                 (crime_id, position, position_id, position_label, position_number,
                  item_id, item_reusable, item_available, torn_user_id, joined_at,
                  progress, outcome, outcome_duration, checkpoint_pass_rate)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(crime_id, position_id) DO UPDATE SET
                 torn_user_id = excluded.torn_user_id,
                 joined_at = excluded.joined_at,
                 progress = excluded.progress,
                 outcome = excluded.outcome,
                 outcome_duration = excluded.outcome_duration,
                 checkpoint_pass_rate = excluded.checkpoint_pass_rate,
                 item_available = excluded.item_available`
            ).bind(
              crime.id, slot.position, posInfo.id ?? null, posInfo.label ?? null, posInfo.number ?? null,
              slot.item_requirement?.id ?? null, slot.item_requirement?.is_reusable ? 1 : 0, slot.item_requirement?.is_available ? 1 : 0,
              slot.user?.id ?? null, slot.user?.joined_at ?? null,
              slot.user?.progress ?? null, slot.user?.outcome ?? null, slot.user?.outcome_duration ?? null,
              slot.checkpoint_pass_rate ?? 0
            ));

            if (slot.user?.id && slot.checkpoint_pass_rate > 0) {
              const key = `${slot.user.id}|${crime.name}|${slot.position}`;
              const existing = cprUpserts.get(key);
              if (!existing || slot.checkpoint_pass_rate > existing.rate) {
                cprUpserts.set(key, { userId: slot.user.id, crimeName: crime.name, position: slot.position, rate: slot.checkpoint_pass_rate, seenAt: slot.user.joined_at ?? crime.created_at ?? null });
              }
            }
          }
        }

        if (crimes.length < 100) break; // last page
      }

      // Batch writes — chunked to stay well under D1 batch size limits
      const CHUNK = 200;
      for (let i = 0; i < crimeUpserts.length; i += CHUNK) await env.DB.batch(crimeUpserts.slice(i, i + CHUNK));
      for (let i = 0; i < slotUpserts.length; i += CHUNK) await env.DB.batch(slotUpserts.slice(i, i + CHUNK));

      const cprStmts = [...cprUpserts.values()].map(c => env.DB.prepare(
        `INSERT INTO oc_member_cpr (torn_user_id, crime_name, position, best_pass_rate, last_seen_at, updated_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(torn_user_id, crime_name, position) DO UPDATE SET
           best_pass_rate = MAX(best_pass_rate, excluded.best_pass_rate),
           last_seen_at = excluded.last_seen_at,
           updated_at = CURRENT_TIMESTAMP`
      ).bind(c.userId, c.crimeName, c.position, c.rate, c.seenAt));
      for (let i = 0; i < cprStmts.length; i += CHUNK) await env.DB.batch(cprStmts.slice(i, i + CHUNK));

      results.crimesUpserted += crimeUpserts.length;
      results.fetched++;
    } catch (e) {
      console.error(`[oc] faction ${factionId} failed:`, e.message);
      results.errors.push({ factionId, error: e.message });
    }
  }

  console.log(`[oc] done — ${results.fetched}/3 fetched, ${results.crimesUpserted} crimes upserted, ${results.errors.length} errors`);
  return results;
}

// ── GET /api/leadership/oc/crimes?faction_id=&status=recruiting|planning|completed ──
export async function getCrimes(request, env, user) {
  try {
    const url = new URL(request.url);
    const factionId = parseInt(url.searchParams.get('faction_id'), 10);
    const status = url.searchParams.get('status'); // optional bucket filter
    if (!factionId || !FACTION_IDS.includes(factionId)) return errorResponse('Invalid or missing faction_id', 400);

    const { results: crimes } = await env.DB.prepare(
      `SELECT * FROM oc_crimes WHERE faction_id = ? ORDER BY created_at DESC LIMIT 300`
    ).bind(factionId).all();

    const filtered = status ? crimes.filter(c => statusBucket(c.status) === status) : crimes;
    if (!filtered.length) return jsonResponse({ crimes: [], members: {} });

    const crimeIds = filtered.map(c => c.id);
    const placeholders = crimeIds.map(() => '?').join(',');
    const { results: slots } = await env.DB.prepare(
      `SELECT * FROM oc_crime_slots WHERE crime_id IN (${placeholders}) ORDER BY position_number ASC`
    ).bind(...crimeIds).all();

    const slotsByCrime = {};
    for (const s of slots) {
      (slotsByCrime[s.crime_id] ??= []).push(s);
    }

    // Resolve usernames: faction_members first, users fallback (mirrors chainController pattern)
    const userIds = [...new Set(slots.map(s => s.torn_user_id).filter(Boolean))];
    const memberMap = {};
    if (userIds.length) {
      const idPlaceholders = userIds.map(() => '?').join(',');
      const { results: members } = await env.DB.prepare(
        `SELECT torn_user_id, username FROM faction_members WHERE torn_user_id IN (${idPlaceholders})`
      ).bind(...userIds).all();
      for (const m of members) memberMap[m.torn_user_id] = m.username;

      const missing = userIds.filter(id => !memberMap[id]);
      if (missing.length) {
        const missingPlaceholders = missing.map(() => '?').join(',');
        const { results: fallback } = await env.DB.prepare(
          `SELECT torn_user_id, username FROM users WHERE torn_user_id IN (${missingPlaceholders})`
        ).bind(...missing).all();
        for (const m of fallback) memberMap[m.torn_user_id] = m.username;
      }
    }

    const enriched = filtered.map(c => ({
      ...c,
      rewards: c.rewards_json ? JSON.parse(c.rewards_json) : null,
      slots: (slotsByCrime[c.id] || []).map(s => ({ ...s, username: s.torn_user_id ? (memberMap[s.torn_user_id] ?? `#${s.torn_user_id}`) : null })),
    }));

    return jsonResponse({ crimes: enriched, members: memberMap });
  } catch (e) {
    console.error('getCrimes error:', e);
    return errorResponse('Failed to fetch crimes: ' + e.message, 500);
  }
}

// ── GET /api/leadership/oc/templates?faction_id= ─────────────────────────────
// Distinct crime names + their position structure (from the most recent crime
// of each name) — feeds the Team Builder's crime picker.
export async function getCrimeTemplates(request, env, user) {
  try {
    const url = new URL(request.url);
    const factionId = parseInt(url.searchParams.get('faction_id'), 10);
    if (!factionId || !FACTION_IDS.includes(factionId)) return errorResponse('Invalid or missing faction_id', 400);

    const { results: names } = await env.DB.prepare(
      `SELECT name, MAX(difficulty) AS difficulty, MAX(id) AS latest_id
       FROM oc_crimes WHERE faction_id = ? GROUP BY name ORDER BY name ASC`
    ).bind(factionId).all();

    if (!names.length) return jsonResponse({ templates: [] });

    const crimeIds = names.map(n => n.latest_id);
    const placeholders = crimeIds.map(() => '?').join(',');
    const { results: slots } = await env.DB.prepare(
      `SELECT crime_id, position, position_label, position_number FROM oc_crime_slots WHERE crime_id IN (${placeholders}) ORDER BY position_number ASC`
    ).bind(...crimeIds).all();

    const slotsByCrime = {};
    for (const s of slots) (slotsByCrime[s.crime_id] ??= []).push(s);

    const templates = names.map(n => ({
      name: n.name,
      difficulty: n.difficulty,
      positions: (slotsByCrime[n.latest_id] || []).map(s => ({ position: s.position, position_label: s.position_label, position_number: s.position_number })),
    }));

    return jsonResponse({ templates });
  } catch (e) {
    console.error('getCrimeTemplates error:', e);
    return errorResponse('Failed to fetch crime templates: ' + e.message, 500);
  }
}

// ── POST /api/leadership/oc/suggest-teams ────────────────────────────────────
// Body: { faction_id, crime_name, team_count }
// Snake-drafts the highest-CPR members per position across N teams so
// strength is spread evenly rather than stacked into a single "best" team.
export async function suggestTeams(request, env, user) {
  try {
    const { faction_id, crime_name, team_count } = await request.json();
    const factionId = parseInt(faction_id, 10);
    const teamCount = parseInt(team_count, 10);
    if (!factionId || !FACTION_IDS.includes(factionId)) return errorResponse('Invalid or missing faction_id', 400);
    if (!crime_name) return errorResponse('crime_name is required', 400);
    if (!teamCount || teamCount < 1 || teamCount > 10) return errorResponse('team_count must be between 1 and 10', 400);

    // Position structure for this crime, from its most recent instance for this faction
    const latest = await env.DB.prepare(
      `SELECT id FROM oc_crimes WHERE faction_id = ? AND name = ? ORDER BY id DESC LIMIT 1`
    ).bind(factionId, crime_name).first();
    if (!latest) return errorResponse('No known crime with that name for this faction', 404);

    const { results: templateSlots } = await env.DB.prepare(
      `SELECT position, position_label, position_number FROM oc_crime_slots WHERE crime_id = ? ORDER BY position_number ASC`
    ).bind(latest.id).all();
    if (!templateSlots.length) return errorResponse('No slot structure found for this crime', 404);

    // Active members of this faction
    const { results: activeMembers } = await env.DB.prepare(
      `SELECT torn_user_id, username FROM faction_members WHERE faction_id = ? AND is_active = 1`
    ).bind(factionId).all();
    const activeIds = new Set(activeMembers.map(m => m.torn_user_id));
    const usernameMap = {};
    for (const m of activeMembers) usernameMap[m.torn_user_id] = m.username;

    // All known CPR for this crime's positions
    const positions = [...new Set(templateSlots.map(s => s.position))];
    const posPlaceholders = positions.map(() => '?').join(',');
    const { results: cprRows } = await env.DB.prepare(
      `SELECT torn_user_id, position, best_pass_rate FROM oc_member_cpr
       WHERE crime_name = ? AND position IN (${posPlaceholders})`
    ).bind(crime_name, ...positions).all();

    // Candidates per position, active members only, sorted by pass rate desc
    const candidatesByPosition = {};
    for (const p of positions) candidatesByPosition[p] = [];
    for (const row of cprRows) {
      if (!activeIds.has(row.torn_user_id)) continue;
      candidatesByPosition[row.position].push({ torn_user_id: row.torn_user_id, username: usernameMap[row.torn_user_id], pass_rate: row.best_pass_rate });
    }
    for (const p of positions) candidatesByPosition[p].sort((a, b) => b.pass_rate - a.pass_rate);

    const teams = Array.from({ length: teamCount }, (_, i) => ({ team_index: i, positions: [] }));
    const usedMembers = new Set();

    // Slots needed per position (e.g. "Muscle" x3 for a 3-muscle crime), repeated per team
    const slotsByPosition = {};
    for (const s of templateSlots) (slotsByPosition[s.position] ??= []).push(s);

    for (const position of positions) {
      const slotsNeededPerTeam = slotsByPosition[position].length;
      const totalSlotsNeeded = slotsNeededPerTeam * teamCount;
      const pool = candidatesByPosition[position].filter(c => !usedMembers.has(c.torn_user_id));

      // Snake draft: round r assigns to teams in forward order on even rounds,
      // reverse order on odd rounds, so the strongest candidates spread across
      // teams instead of stacking into team 0.
      let picked = 0;
      let round = 0;
      while (picked < totalSlotsNeeded && picked < pool.length) {
        const order = round % 2 === 0
          ? [...Array(teamCount).keys()]
          : [...Array(teamCount).keys()].reverse();
        for (const teamIdx of order) {
          if (picked >= totalSlotsNeeded || picked >= pool.length) break;
          const candidate = pool[picked];
          usedMembers.add(candidate.torn_user_id);
          teams[teamIdx].positions.push({
            position,
            position_label: slotsByPosition[position][Math.floor(teams[teamIdx].positions.filter(p => p.position === position).length)]?.position_label ?? position,
            torn_user_id: candidate.torn_user_id,
            username: candidate.username,
            pass_rate: candidate.pass_rate,
          });
          picked++;
        }
        round++;
      }
    }

    for (const team of teams) {
      const rates = team.positions.map(p => p.pass_rate);
      team.avg_pass_rate = rates.length ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10 : 0;
      team.filled = team.positions.length;
      team.needed = templateSlots.length;
    }

    return jsonResponse({ crime_name, difficulty: null, teams });
  } catch (e) {
    console.error('suggestTeams error:', e);
    return errorResponse('Failed to suggest teams: ' + e.message, 500);
  }
}

// ── Admin: cache status + manual refresh ─────────────────────────────────────
export async function getOcStatus(request, env, user) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT faction_id, COUNT(*) AS count, MAX(fetched_at) AS fetched_at FROM oc_crimes GROUP BY faction_id`
    ).all();
    const status = {};
    for (const row of results) status[row.faction_id] = { count: row.count, fetched_at: row.fetched_at };
    return jsonResponse({ status });
  } catch (e) {
    return errorResponse('Failed to fetch OC status: ' + e.message, 500);
  }
}

export async function refreshOcCrimes(request, env, user) {
  try {
    const result = await fetchAndCacheFactionCrimes(env);
    return jsonResponse({
      message: `OC crimes refreshed: ${result.fetched}/3 factions, ${result.crimesUpserted} crimes upserted`,
      ...result,
      refreshedAt: new Date().toISOString(),
    });
  } catch (e) {
    return errorResponse('OC crimes refresh failed: ' + e.message, 500);
  }
}
