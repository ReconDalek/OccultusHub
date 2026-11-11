import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { getStaffApiKeyForFaction, fetchWithRetry } from '../services/tornApiService.js';

const FACTION_IDS = [33097, 9728, 9171];
const TORN_API_BASE = 'https://api.torn.com/v2';
const MAX_PAGES = 5; // 500 crimes per faction per run — plenty of headroom over a day's activity

const BUCKET_STATUSES = {
  recruiting: ['Recruiting'],
  planning: ['Planning'],
  completed: ['Successful', 'Failure'],
};

// D1 rejects statements with too many bound parameters (SQLITE_ERROR "too many
// SQL variables") once an IN(...) list gets large — the Completed bucket alone
// can have hundreds of crime ids. Run the IN(...) query in chunks instead.
async function fetchInChunks(env, buildQuery, ids, chunkSize = 100) {
  const all = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const batch = ids.slice(i, i + chunkSize);
    const placeholders = batch.map(() => '?').join(',');
    const { results } = await env.DB.prepare(buildQuery(placeholders)).bind(...batch).all();
    all.push(...results);
  }
  return all;
}

// ── Cron: fetch + cache all crimes for all 3 factions ────────────────────────
// `factionIds`/`maxPages` let a caller scope this to a quick live-state poll
// (e.g. the rotation scheduler only cares about OCC1's current Recruiting/
// Planning crimes, which sort first — one page is enough) instead of the
// full 500-crime daily history pull. Defaults preserve the original behavior.
export async function fetchAndCacheFactionCrimes(env, { factionIds = FACTION_IDS, maxPages = MAX_PAGES } = {}) {
  const results = { fetched: 0, crimesUpserted: 0, errors: [] };

  for (const factionId of factionIds) {
    try {
      const apiKeyObj = await getStaffApiKeyForFaction(env, factionId);
      if (!apiKeyObj?.key) {
        results.errors.push({ factionId, error: 'No API key available for this faction' });
        continue;
      }

      let crimeUpserts = [];
      let slotUpserts = [];
      let cprUpserts = new Map(); // key = `${torn_user_id}|${crime_name}|${position}` -> { rate, seenAt } (keep max per run)

      for (let page = 0; page < maxPages; page++) {
        const offset = page * 100;
        const data = await fetchWithRetry(
          `${TORN_API_BASE}/faction/crimes?cat=all&offset=${offset}&sort=DESC&comment=OccHub`,
          () => getStaffApiKeyForFaction(env, factionId),
          env
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
            const itemOutcome = slot.user?.item_outcome || null;
            slotUpserts.push(env.DB.prepare(
              `INSERT INTO oc_crime_slots
                 (crime_id, position, position_id, position_label, position_number,
                  item_id, item_reusable, item_available, torn_user_id, joined_at,
                  progress, outcome, outcome_duration, checkpoint_pass_rate,
                  item_outcome_owner, item_outcome_result)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(crime_id, position_id) DO UPDATE SET
                 torn_user_id = excluded.torn_user_id,
                 joined_at = excluded.joined_at,
                 progress = excluded.progress,
                 outcome = excluded.outcome,
                 outcome_duration = excluded.outcome_duration,
                 checkpoint_pass_rate = excluded.checkpoint_pass_rate,
                 item_available = excluded.item_available,
                 item_outcome_owner = excluded.item_outcome_owner,
                 item_outcome_result = excluded.item_outcome_result`
            ).bind(
              crime.id, slot.position, posInfo.id ?? null, posInfo.label ?? null, posInfo.number ?? null,
              slot.item_requirement?.id ?? null, slot.item_requirement?.is_reusable ? 1 : 0, slot.item_requirement?.is_available ? 1 : 0,
              slot.user?.id ?? null, slot.user?.joined_at ?? null,
              slot.user?.progress ?? null, slot.user?.outcome ?? null, slot.user?.outcome_duration ?? null,
              slot.checkpoint_pass_rate ?? 0,
              itemOutcome?.owned_by ?? null, itemOutcome?.outcome ?? null
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

  try {
    await syncPositionWeights(env);
  } catch (e) {
    console.error('[oc] syncPositionWeights failed:', e.message);
    results.errors.push({ error: 'syncPositionWeights: ' + e.message });
  }

  console.log(`[oc] done — ${results.fetched}/3 fetched, ${results.crimesUpserted} crimes upserted, ${results.errors.length} errors`);
  return results;
}

// ── GET /api/leadership/oc/crimes?faction_id=&status=recruiting|planning|completed ──
// Recruiting sorts soonest-to-expire first, Planning sorts soonest-ready first,
// Completed sorts most-recently-created first.
export async function getCrimes(request, env, user) {
  try {
    const url = new URL(request.url);
    const factionId = parseInt(url.searchParams.get('faction_id'), 10);
    const status = url.searchParams.get('status'); // optional bucket filter
    if (!factionId || !FACTION_IDS.includes(factionId)) return errorResponse('Invalid or missing faction_id', 400);

    let query = `SELECT * FROM oc_crimes WHERE faction_id = ?`;
    const params = [factionId];
    if (status && BUCKET_STATUSES[status]) {
      const statuses = BUCKET_STATUSES[status];
      query += ` AND status IN (${statuses.map(() => '?').join(',')})`;
      params.push(...statuses);
    }
    // Completed sorts by actual completion time (executed_at), not creation
    // time — a crime can sit in Recruiting/Planning for a while before it
    // finishes, so created_at DESC doesn't reflect "most recently completed".
    // Expired crimes have no executed_at, so fall back to expired_at.
    const orderBy = status === 'recruiting' ? 'expired_at ASC'
      : status === 'planning' ? 'ready_at ASC'
      : 'COALESCE(executed_at, expired_at, created_at) DESC';
    query += ` ORDER BY ${orderBy} LIMIT 300`;

    const { results: crimes } = await env.DB.prepare(query).bind(...params).all();
    if (!crimes.length) return jsonResponse({ crimes: [], members: {} });

    const crimeIds = crimes.map(c => c.id);
    const slots = await fetchInChunks(
      env,
      ph => `SELECT * FROM oc_crime_slots WHERE crime_id IN (${ph}) ORDER BY position_number ASC`,
      crimeIds
    );

    const slotsByCrime = {};
    for (const s of slots) {
      (slotsByCrime[s.crime_id] ??= []).push(s);
    }

    // Resolve usernames: faction_members first, users fallback (mirrors chainController pattern)
    const userIds = [...new Set(slots.map(s => s.torn_user_id).filter(Boolean))];
    const memberMap = {};
    if (userIds.length) {
      const members = await fetchInChunks(env, ph => `SELECT torn_user_id, username FROM faction_members WHERE torn_user_id IN (${ph})`, userIds);
      for (const m of members) memberMap[m.torn_user_id] = m.username;

      const missing = userIds.filter(id => !memberMap[id]);
      if (missing.length) {
        const fallback = await fetchInChunks(env, ph => `SELECT torn_user_id, username FROM users WHERE torn_user_id IN (${ph})`, missing);
        for (const m of fallback) memberMap[m.torn_user_id] = m.username;
      }
    }

    const parsedRewards = {};
    for (const c of crimes) parsedRewards[c.id] = c.rewards_json ? JSON.parse(c.rewards_json) : null;

    // Per-slot weight config, keyed by `${crime_name}|${position}|${position_number}`.
    const crimeNames = [...new Set(crimes.map(c => c.name))];
    const weightMap = {};
    if (crimeNames.length) {
      const weightRows = await fetchInChunks(
        env,
        ph => `SELECT crime_name, position, position_number, weight FROM oc_position_weights WHERE crime_name IN (${ph})`,
        crimeNames
      );
      for (const w of weightRows) weightMap[`${w.crime_name}|${w.position}|${w.position_number}`] = w.weight;
    }

    // Resolve item names + prices for display — covers both required-item
    // slots and crime reward items (looked up against the same armory-cron
    // item_prices_cache used for armory valuation, so values stay consistent).
    const rewardItemIds = Object.values(parsedRewards).flatMap(r => (r?.items || []).map(i => i.id));
    const itemIds = [...new Set([...slots.map(s => s.item_id).filter(Boolean), ...rewardItemIds])];
    const itemNameMap = {};
    const itemPriceMap = {};
    if (itemIds.length) {
      const items = await fetchInChunks(env, ph => `SELECT item_id, name, effective_price FROM item_prices_cache WHERE item_id IN (${ph})`, itemIds);
      for (const i of items) { itemNameMap[i.item_id] = i.name; itemPriceMap[i.item_id] = i.effective_price; }
    }

    const enriched = crimes.map(c => {
      const rewards = parsedRewards[c.id];
      const rewardItems = (rewards?.items || []).map(i => ({
        ...i,
        name: itemNameMap[i.id] ?? `Item #${i.id}`,
        unit_price: itemPriceMap[i.id] ?? 0,
        total_value: (itemPriceMap[i.id] ?? 0) * (i.quantity || 1),
      }));
      const rewardItemsValue = rewardItems.reduce((sum, i) => sum + i.total_value, 0);
      return {
        ...c,
        rewards: rewards ? { ...rewards, items: rewardItems } : null,
        reward_items_value: rewardItemsValue,
        slots: (slotsByCrime[c.id] || []).map(s => ({
          ...s,
          username: s.torn_user_id ? (memberMap[s.torn_user_id] ?? `#${s.torn_user_id}`) : null,
          item_name: s.item_id ? (itemNameMap[s.item_id] ?? `Item #${s.item_id}`) : null,
          item_unit_price: s.item_id ? (itemPriceMap[s.item_id] ?? 0) : 0,
          weight: weightMap[`${c.name}|${s.position}|${s.position_number}`] ?? 100,
        })),
      };
    });

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
    const slots = await fetchInChunks(
      env,
      ph => `SELECT crime_id, position, position_label, position_number FROM oc_crime_slots WHERE crime_id IN (${ph}) ORDER BY position_number ASC`,
      crimeIds
    );

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

// Keeps oc_position_weights in sync with reality: seeds any newly-seen
// crime/slot combo at a default weight of 100 (new Torn crime types show up
// automatically, no manual entry needed). Weights are never auto-derived —
// leadership sets the real value for a slot via the Config tab when they
// have it; until then every slot sits at the 100 default.
async function syncPositionWeights(env) {
  const { results: slotDefs } = await env.DB.prepare(
    `SELECT DISTINCT c.name AS crime_name, s.position, s.position_number, s.position_label
     FROM oc_crime_slots s JOIN oc_crimes c ON c.id = s.crime_id
     WHERE s.position_number IS NOT NULL`
  ).all();
  if (!slotDefs.length) return;

  // Seed any never-seen-before (crime_name, position, position_number) rows.
  const CHUNK = 200;
  const seedStmts = slotDefs.map(s => env.DB.prepare(
    `INSERT OR IGNORE INTO oc_position_weights (crime_name, position, position_number, position_label, weight, auto_computed)
     VALUES (?, ?, ?, ?, 100, 1)`
  ).bind(s.crime_name, s.position, s.position_number, s.position_label));
  for (let i = 0; i < seedStmts.length; i += CHUNK) await env.DB.batch(seedStmts.slice(i, i + CHUNK));
}

// ── GET /api/leadership/oc/weights ────────────────────────────────────────────
// Every known crime's per-slot weights, grouped by crime name — feeds the
// Config tab's bulk editor.
export async function getPositionWeightsConfig(request, env, user) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT crime_name, position, position_number, position_label, weight, auto_computed, updated_at
       FROM oc_position_weights
       ORDER BY crime_name ASC, position_number ASC`
    ).all();

    const byCrime = {};
    for (const row of results) {
      (byCrime[row.crime_name] ??= []).push(row);
    }
    const crimes = Object.entries(byCrime).map(([crime_name, slots]) => ({ crime_name, slots }));

    return jsonResponse({ crimes });
  } catch (e) {
    console.error('getPositionWeightsConfig error:', e);
    return errorResponse('Failed to fetch position weights: ' + e.message, 500);
  }
}

// ── POST /api/leadership/oc/weights ───────────────────────────────────────────
// Body: { updates: [{ crime_name, position, position_number, weight }, ...] }
// Bulk manual override — marks each touched row auto_computed = 0 so the
// nightly sync never overwrites leadership's deliberate adjustment again.
export async function updatePositionWeightsConfig(request, env, user) {
  try {
    const { updates } = await request.json();
    if (!Array.isArray(updates) || !updates.length) return errorResponse('updates array is required', 400);
    if (updates.length > 500) return errorResponse('Max 500 updates per request', 400);

    const stmts = updates.map(u => env.DB.prepare(
      `UPDATE oc_position_weights
       SET weight = ?, auto_computed = 0, updated_at = CURRENT_TIMESTAMP, updated_by = ?
       WHERE crime_name = ? AND position = ? AND position_number = ?`
    ).bind(Number(u.weight) || 0, user.userId, u.crime_name, u.position, Number(u.position_number)));

    const CHUNK = 200;
    for (let i = 0; i < stmts.length; i += CHUNK) await env.DB.batch(stmts.slice(i, i + CHUNK));

    return jsonResponse({ updated: stmts.length });
  } catch (e) {
    console.error('updatePositionWeightsConfig error:', e);
    return errorResponse('Failed to update position weights: ' + e.message, 500);
  }
}

// Builds N teams for one crime, snake-drafting the highest-CPR active
// members per SLOT INSTANCE (e.g. "Muscle #1" is its own slot, distinct from
// "Muscle #2") so strength spreads evenly across teams. Slots are filled in
// weight order (highest-impact slot first, per the stored oc_position_weights
// config) so the members who are strong in a position get claimed by
// whichever specific slot matters most to success, before lower-impact slots
// of the same bare position pick from what's left. Same-position slots share
// one alternating snake-draft round counter so e.g. Muscle #1/#2/#3 don't
// each restart from team 0.
// `usedMembers` is a Set mutated in place — callers can seed it with members
// already committed to other crimes so a multi-crime batch never double-books.
async function buildTeamsForCrime(env, factionId, crimeName, teamCount, usedMembers) {
  const latest = await env.DB.prepare(
    `SELECT id FROM oc_crimes WHERE faction_id = ? AND name = ? ORDER BY id DESC LIMIT 1`
  ).bind(factionId, crimeName).first();
  if (!latest) return { crime_name: crimeName, error: 'No known crime with that name for this faction', teams: [] };

  const { results: templateSlots } = await env.DB.prepare(
    `SELECT position, position_label, position_number FROM oc_crime_slots WHERE crime_id = ? ORDER BY position_number ASC`
  ).bind(latest.id).all();
  if (!templateSlots.length) return { crime_name: crimeName, error: 'No slot structure found for this crime', teams: [] };

  const { results: activeMembers } = await env.DB.prepare(
    `SELECT torn_user_id, username FROM faction_members WHERE faction_id = ? AND is_active = 1`
  ).bind(factionId).all();
  const activeIds = new Set(activeMembers.map(m => m.torn_user_id));
  const usernameMap = {};
  for (const m of activeMembers) usernameMap[m.torn_user_id] = m.username;

  const positions = [...new Set(templateSlots.map(s => s.position))];
  const posPlaceholders = positions.map(() => '?').join(',');
  const { results: cprRows } = await env.DB.prepare(
    `SELECT torn_user_id, position, best_pass_rate FROM oc_member_cpr
     WHERE crime_name = ? AND position IN (${posPlaceholders})`
  ).bind(crimeName, ...positions).all();

  const candidatesByPosition = {};
  for (const p of positions) candidatesByPosition[p] = [];
  for (const row of cprRows) {
    if (!activeIds.has(row.torn_user_id)) continue;
    candidatesByPosition[row.position].push({ torn_user_id: row.torn_user_id, username: usernameMap[row.torn_user_id], pass_rate: row.best_pass_rate });
  }
  for (const p of positions) candidatesByPosition[p].sort((a, b) => b.pass_rate - a.pass_rate);

  const { results: weightRows } = await env.DB.prepare(
    `SELECT position, position_number, position_label, weight FROM oc_position_weights WHERE crime_name = ?`
  ).bind(crimeName).all();
  const weightMap = {}; // key = `${position}|${position_number}` -> weight
  for (const w of weightRows) weightMap[`${w.position}|${w.position_number}`] = w.weight;

  // Flatten the template into individual slot instances (Muscle #1, Muscle
  // #2, ... each their own entry), sorted by weight descending so the
  // highest-impact instance gets first pick of the strongest remaining
  // candidates for its position.
  const slotInstances = templateSlots
    .map(s => ({ ...s, weight: weightMap[`${s.position}|${s.position_number}`] ?? 100 }))
    .sort((a, b) => b.weight - a.weight);

  const teams = Array.from({ length: teamCount }, (_, i) => ({ team_index: i, positions: [] }));

  // Each bare position keeps its own alternating round counter, shared
  // across that position's slot instances, so Muscle #1/#2/#3 draft from the
  // same ordered pool (freshly re-filtered against usedMembers each slot)
  // without restarting the snake direction from team 0 every time.
  const roundByPosition = {};
  for (const p of positions) roundByPosition[p] = 0;

  for (const slot of slotInstances) {
    const { position } = slot;
    const available = candidatesByPosition[position].filter(c => !usedMembers.has(c.torn_user_id));

    const order = roundByPosition[position] % 2 === 0
      ? [...Array(teamCount).keys()]
      : [...Array(teamCount).keys()].reverse();

    let picked = 0;
    for (const teamIdx of order) {
      if (picked >= available.length) break;
      const candidate = available[picked];
      usedMembers.add(candidate.torn_user_id);
      teams[teamIdx].positions.push({
        position,
        position_label: slot.position_label ?? position,
        position_number: slot.position_number,
        torn_user_id: candidate.torn_user_id,
        username: candidate.username,
        pass_rate: candidate.pass_rate,
        weight: slot.weight,
      });
      picked++;
    }
    roundByPosition[position]++;
  }

  for (const team of teams) {
    const rates = team.positions.map(p => p.pass_rate);
    team.avg_pass_rate = rates.length ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10 : 0;
    team.filled = team.positions.length;
    team.needed = templateSlots.length;
  }

  return { crime_name: crimeName, teams };
}

// ── POST /api/leadership/oc/suggest-teams ────────────────────────────────────
// Body: { faction_id, crime_name, team_count }
export async function suggestTeams(request, env, user) {
  try {
    const { faction_id, crime_name, team_count } = await request.json();
    const factionId = parseInt(faction_id, 10);
    const teamCount = parseInt(team_count, 10);
    if (!factionId || !FACTION_IDS.includes(factionId)) return errorResponse('Invalid or missing faction_id', 400);
    if (!crime_name) return errorResponse('crime_name is required', 400);
    if (!teamCount || teamCount < 1 || teamCount > 10) return errorResponse('team_count must be between 1 and 10', 400);

    const result = await buildTeamsForCrime(env, factionId, crime_name, teamCount, new Set());
    if (result.error) return errorResponse(result.error, 404);

    return jsonResponse({ crime_name: result.crime_name, difficulty: null, teams: result.teams });
  } catch (e) {
    console.error('suggestTeams error:', e);
    return errorResponse('Failed to suggest teams: ' + e.message, 500);
  }
}

// ── POST /api/leadership/oc/suggest-teams-batch ───────────────────────────────
// Body: { faction_id, crimes: [{ crime_name, team_count }, ...] }
// Builds teams for each crime IN ORDER, carrying the used-members set forward
// so a member drafted for an earlier crime in the batch can never also be
// drafted for a later one — a member can only actually run one crime at a time.
export async function suggestTeamsBatch(request, env, user) {
  try {
    const { faction_id, crimes } = await request.json();
    const factionId = parseInt(faction_id, 10);
    if (!factionId || !FACTION_IDS.includes(factionId)) return errorResponse('Invalid or missing faction_id', 400);
    if (!Array.isArray(crimes) || !crimes.length) return errorResponse('crimes array is required', 400);
    if (crimes.length > 10) return errorResponse('Max 10 crimes per batch', 400);

    const usedMembers = new Set();
    const results = [];
    for (const entry of crimes) {
      const teamCount = parseInt(entry.team_count, 10);
      if (!entry.crime_name || !teamCount || teamCount < 1 || teamCount > 10) {
        results.push({ crime_name: entry.crime_name ?? null, error: 'Invalid crime_name or team_count', teams: [] });
        continue;
      }
      results.push(await buildTeamsForCrime(env, factionId, entry.crime_name, teamCount, usedMembers));
    }

    return jsonResponse({ results });
  } catch (e) {
    console.error('suggestTeamsBatch error:', e);
    return errorResponse('Failed to suggest teams: ' + e.message, 500);
  }
}

// ── GET /api/leadership/oc/roster?faction_id=&crime_name= ────────────────────
// Active faction members + their best-known CPR per position for this crime —
// feeds the Custom Team Builder's manual member pickers.
export async function getCrimeRoster(request, env, user) {
  try {
    const url = new URL(request.url);
    const factionId = parseInt(url.searchParams.get('faction_id'), 10);
    const crimeName = url.searchParams.get('crime_name');
    if (!factionId || !FACTION_IDS.includes(factionId)) return errorResponse('Invalid or missing faction_id', 400);
    if (!crimeName) return errorResponse('crime_name is required', 400);

    const { results: members } = await env.DB.prepare(
      `SELECT torn_user_id, username FROM faction_members WHERE faction_id = ? AND is_active = 1 ORDER BY username ASC`
    ).bind(factionId).all();

    const { results: cprRows } = await env.DB.prepare(
      `SELECT torn_user_id, position, best_pass_rate FROM oc_member_cpr WHERE crime_name = ?`
    ).bind(crimeName).all();

    const cpr = {};
    for (const row of cprRows) {
      (cpr[row.torn_user_id] ??= {})[row.position] = row.best_pass_rate;
    }

    return jsonResponse({ members, cpr });
  } catch (e) {
    console.error('getCrimeRoster error:', e);
    return errorResponse('Failed to fetch crime roster: ' + e.message, 500);
  }
}

// ── GET /api/leadership/oc/members?faction_id= ────────────────────────────────
// Bare active-member list (id + username) for the Member Lookup tab's picker.
export async function getFactionMemberList(request, env, user) {
  try {
    const url = new URL(request.url);
    const factionId = parseInt(url.searchParams.get('faction_id'), 10);
    if (!factionId || !FACTION_IDS.includes(factionId)) return errorResponse('Invalid or missing faction_id', 400);

    const { results: members } = await env.DB.prepare(
      `SELECT torn_user_id, username FROM faction_members WHERE faction_id = ? AND is_active = 1 ORDER BY username ASC`
    ).bind(factionId).all();
    return jsonResponse({ members });
  } catch (e) {
    console.error('getFactionMemberList error:', e);
    return errorResponse('Failed to fetch members: ' + e.message, 500);
  }
}

// Every (crime_name, difficulty, position) combo we've ever seen, across all
// history — the fixed "grid" the Member/Faction Lookup tables are built on,
// so a crime or role nobody's tried yet still shows up as an empty cell
// instead of disappearing.
async function getAllCrimePositions(env) {
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT c.name AS crime_name, c.difficulty, s.position
     FROM oc_crime_slots s JOIN oc_crimes c ON c.id = s.crime_id
     WHERE c.difficulty IS NOT NULL
     ORDER BY c.difficulty ASC, c.name ASC, s.position ASC`
  ).all();
  return results;
}

function buildCprGrid(allPositions, ratesByKey) {
  const byCrime = new Map();
  for (const row of allPositions) {
    const entry = byCrime.get(row.crime_name) ?? { crime_name: row.crime_name, difficulty: row.difficulty, positions: [] };
    const rate = ratesByKey.get(`${row.crime_name}|${row.position}`);
    entry.positions.push({ position: row.position, rate: rate?.rate ?? null, n: rate?.n ?? 0 });
    byCrime.set(row.crime_name, entry);
  }
  return [...byCrime.values()];
}

// ── GET /api/leadership/oc/member-lookup?torn_user_id= ────────────────────────
// One member's best-known CPR for EVERY crime+position we've ever tracked —
// untried combos still appear, just empty — so leadership can see a full
// career snapshot, trends across tiers included, not just enabled crimes.
export async function getMemberCprLookup(request, env, user) {
  try {
    const url = new URL(request.url);
    const tornUserId = parseInt(url.searchParams.get('torn_user_id'), 10);
    if (!tornUserId) return errorResponse('torn_user_id is required', 400);

    const allPositions = await getAllCrimePositions(env);
    const { results: cprRows } = await env.DB.prepare(
      `SELECT crime_name, position, best_pass_rate FROM oc_member_cpr WHERE torn_user_id = ?`
    ).bind(tornUserId).all();
    const ratesByKey = new Map(cprRows.map(r => [`${r.crime_name}|${r.position}`, { rate: r.best_pass_rate }]));

    return jsonResponse({ crimes: buildCprGrid(allPositions, ratesByKey) });
  } catch (e) {
    console.error('getMemberCprLookup error:', e);
    return errorResponse('Failed to fetch member CPR lookup: ' + e.message, 500);
  }
}

// ── GET /api/leadership/oc/faction-lookup?faction_id= ─────────────────────────
// Same grid, averaged across that faction's currently active roster — a
// broad "how capable is our roster, by crime and position" view.
export async function getFactionCprLookup(request, env, user) {
  try {
    const url = new URL(request.url);
    const factionId = parseInt(url.searchParams.get('faction_id'), 10);
    if (!factionId || !FACTION_IDS.includes(factionId)) return errorResponse('Invalid or missing faction_id', 400);

    const allPositions = await getAllCrimePositions(env);
    const { results: avgRows } = await env.DB.prepare(
      `SELECT cpr.crime_name, cpr.position, AVG(cpr.best_pass_rate) AS avg_rate, COUNT(*) AS n
       FROM oc_member_cpr cpr
       JOIN faction_members fm ON fm.torn_user_id = cpr.torn_user_id AND fm.faction_id = ? AND fm.is_active = 1
       GROUP BY cpr.crime_name, cpr.position`
    ).bind(factionId).all();
    const ratesByKey = new Map(avgRows.map(r => [`${r.crime_name}|${r.position}`, { rate: Math.round(r.avg_rate * 10) / 10, n: r.n }]));

    return jsonResponse({ crimes: buildCprGrid(allPositions, ratesByKey) });
  } catch (e) {
    console.error('getFactionCprLookup error:', e);
    return errorResponse('Failed to fetch faction CPR lookup: ' + e.message, 500);
  }
}

// ── GET /api/leadership/oc/tier-trends ────────────────────────────────────────
// Cross-tier trend data: overall avg CPR per difficulty, avg per (position,
// difficulty), and the average change in a member's own avg when moving up
// one tier (e.g. "typically drops ~7 points going from lvl6 to lvl7").
export async function getTierTrends(request, env, user) {
  try {
    const { results: overallByTier } = await env.DB.prepare(
      `SELECT nd.difficulty, AVG(cpr.best_pass_rate) AS avg_rate, COUNT(*) AS n
       FROM oc_member_cpr cpr JOIN (SELECT DISTINCT name, difficulty FROM oc_crimes) nd ON nd.name = cpr.crime_name
       WHERE nd.difficulty IS NOT NULL
       GROUP BY nd.difficulty ORDER BY nd.difficulty ASC`
    ).all();

    const { results: byPositionTier } = await env.DB.prepare(
      `SELECT cpr.position, nd.difficulty, AVG(cpr.best_pass_rate) AS avg_rate, COUNT(*) AS n
       FROM oc_member_cpr cpr JOIN (SELECT DISTINCT name, difficulty FROM oc_crimes) nd ON nd.name = cpr.crime_name
       WHERE nd.difficulty IS NOT NULL
       GROUP BY cpr.position, nd.difficulty
       HAVING n >= 5
       ORDER BY cpr.position ASC, nd.difficulty ASC`
    ).all();

    const { results: stepChange } = await env.DB.prepare(
      `WITH member_tier AS (
         SELECT cpr.torn_user_id, nd.difficulty, AVG(cpr.best_pass_rate) AS avg_rate
         FROM oc_member_cpr cpr JOIN (SELECT DISTINCT name, difficulty FROM oc_crimes) nd ON nd.name = cpr.crime_name
         WHERE nd.difficulty IS NOT NULL
         GROUP BY cpr.torn_user_id, nd.difficulty
       )
       SELECT a.difficulty AS from_tier, b.difficulty AS to_tier,
              AVG(b.avg_rate - a.avg_rate) AS avg_change, COUNT(*) AS n
       FROM member_tier a JOIN member_tier b ON b.torn_user_id = a.torn_user_id AND b.difficulty = a.difficulty + 1
       GROUP BY a.difficulty, b.difficulty ORDER BY a.difficulty ASC`
    ).all();

    return jsonResponse({
      overall_by_tier: overallByTier.map(r => ({ difficulty: r.difficulty, avg_rate: Math.round(r.avg_rate * 10) / 10, n: r.n })),
      by_position_tier: byPositionTier.map(r => ({ position: r.position, difficulty: r.difficulty, avg_rate: Math.round(r.avg_rate * 10) / 10, n: r.n })),
      step_change: stepChange.map(r => ({ from_tier: r.from_tier, to_tier: r.to_tier, avg_change: Math.round(r.avg_change * 10) / 10, n: r.n })),
    });
  } catch (e) {
    console.error('getTierTrends error:', e);
    return errorResponse('Failed to fetch tier trends: ' + e.message, 500);
  }
}

// ── GET /api/leadership/oc/cpr-curves ─────────────────────────────────────────
// Empirical "does this CPR actually tend to succeed?" curve per crime name +
// position, bucketed in 10-point CPR bands, computed from every completed
// crime across all 3 factions (mechanics aren't faction-specific, so pooling
// gives more sample size than scoping to one faction). Used to colour CPR
// badges by real observed pass rate instead of the raw number alone.
export async function getCprCurves(request, env, user) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT c.name AS crime_name, s.position,
              (s.checkpoint_pass_rate / 10) * 10 AS cpr_bucket,
              COUNT(*) AS total,
              SUM(CASE WHEN s.outcome = 'Successful' THEN 1 ELSE 0 END) AS successes
       FROM oc_crime_slots s
       JOIN oc_crimes c ON c.id = s.crime_id
       WHERE c.status IN ('Successful','Failure')
         AND s.torn_user_id IS NOT NULL AND s.checkpoint_pass_rate > 0 AND s.outcome IS NOT NULL
       GROUP BY c.name, s.position, cpr_bucket
       ORDER BY c.name, s.position, cpr_bucket ASC`
    ).all();

    const curves = {};
    for (const row of results) {
      const byPosition = (curves[row.crime_name] ??= {});
      const buckets = (byPosition[row.position] ??= []);
      buckets.push({
        cpr: row.cpr_bucket,
        success_rate: Math.round((row.successes / row.total) * 1000) / 10,
        sample_size: row.total,
      });
    }

    return jsonResponse({ curves });
  } catch (e) {
    console.error('getCprCurves error:', e);
    return errorResponse('Failed to fetch CPR curves: ' + e.message, 500);
  }
}

// ── POST /api/leadership/oc/predict-success ───────────────────────────────────
// Body: { faction_id, crime_name, member_ids: [...], avg_cpr? }
// 1) Looks for past completed runs of this crime by this exact set of members
//    (same people, regardless of position) and returns their real success rate.
// 2) If no exact match exists, falls back to comparing this team's average CPR
//    against the average CPR seen in this crime's past successful vs failed
//    runs, and interpolates a rough estimated success chance.
export async function predictSuccess(request, env, user) {
  try {
    const { faction_id, crime_name, member_ids, avg_cpr } = await request.json();
    const factionId = parseInt(faction_id, 10);
    if (!factionId || !FACTION_IDS.includes(factionId)) return errorResponse('Invalid or missing faction_id', 400);
    if (!crime_name) return errorResponse('crime_name is required', 400);
    if (!Array.isArray(member_ids) || !member_ids.length) return errorResponse('member_ids array is required', 400);

    const targetSet = new Set(member_ids.map(Number));

    const { results: pastCrimes } = await env.DB.prepare(
      `SELECT id, status FROM oc_crimes WHERE faction_id = ? AND name = ? AND status IN ('Successful','Failure') ORDER BY id ASC`
    ).bind(factionId, crime_name).all();

    if (!pastCrimes.length) {
      return jsonResponse({ exact_match: null, fallback: null, message: 'No completed runs of this crime found for this faction yet.' });
    }

    const crimeIds = pastCrimes.map(c => c.id);
    const slots = await fetchInChunks(
      env,
      ph => `SELECT crime_id, torn_user_id, checkpoint_pass_rate FROM oc_crime_slots WHERE crime_id IN (${ph}) AND torn_user_id IS NOT NULL`,
      crimeIds
    );

    const slotsByCrime = {};
    for (const s of slots) (slotsByCrime[s.crime_id] ??= []).push(s);

    // 1) Exact-team match — same set of participants, any position
    let exactRuns = 0, exactSuccesses = 0;
    for (const crime of pastCrimes) {
      const participantIds = new Set((slotsByCrime[crime.id] || []).map(s => s.torn_user_id));
      if (participantIds.size !== targetSet.size) continue;
      let same = true;
      for (const id of targetSet) if (!participantIds.has(id)) { same = false; break; }
      if (!same) continue;
      exactRuns++;
      if (crime.status === 'Successful') exactSuccesses++;
    }
    const exactMatch = exactRuns > 0
      ? { runs: exactRuns, successes: exactSuccesses, success_rate: Math.round((exactSuccesses / exactRuns) * 1000) / 10 }
      : null;

    // 2) Fallback — average participant CPR of past successful vs failed runs
    let successCprs = [], failCprs = [];
    for (const crime of pastCrimes) {
      const crimeSlots = slotsByCrime[crime.id] || [];
      const rates = crimeSlots.map(s => s.checkpoint_pass_rate).filter(r => r > 0);
      if (!rates.length) continue;
      const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
      (crime.status === 'Successful' ? successCprs : failCprs).push(avg);
    }

    let fallback = null;
    if (successCprs.length && failCprs.length) {
      const successAvg = successCprs.reduce((a, b) => a + b, 0) / successCprs.length;
      const failAvg = failCprs.reduce((a, b) => a + b, 0) / failCprs.length;
      const teamAvg = typeof avg_cpr === 'number' ? avg_cpr : null;

      let estimatedChance = null;
      if (teamAvg !== null && successAvg !== failAvg) {
        const clamped = Math.max(0, Math.min(1, (teamAvg - failAvg) / (successAvg - failAvg)));
        estimatedChance = Math.round(clamped * 1000) / 10;
      }

      fallback = {
        sample_size: successCprs.length + failCprs.length,
        success_avg_cpr: Math.round(successAvg * 10) / 10,
        fail_avg_cpr: Math.round(failAvg * 10) / 10,
        team_avg_cpr: teamAvg,
        estimated_success_chance: estimatedChance,
      };
    }

    return jsonResponse({ exact_match: exactMatch, fallback });
  } catch (e) {
    console.error('predictSuccess error:', e);
    return errorResponse('Failed to predict success: ' + e.message, 500);
  }
}

// This month's Organized Crime profit for one faction — the faction's cut of
// every paid-out crime's reward money, minus the cost of non-reusable
// faction-owned items actually consumed running crimes this month. Members
// split the payout percentage recorded on the crime itself (usually 80%,
// per policy), faction keeps the rest (usually 20%) — used by
// accountingController's `oc` income line, which reads monthly_income (net).
// Income is scoped by payout.paid_at (Successful crimes only — failed crimes
// have no payout). Item expense is scoped separately by executed_at across
// BOTH Successful and Failure crimes, since a failed crime still burns
// non-reusable items (e.g. a lost/used item) even though it earned nothing.
// `monthStartTs`/`monthEndTs` (unix seconds) let accountingController ask
// about a past month instead of always the live current one — both default
// to the current calendar month when omitted, preserving prior behavior.
// `crimeNames` (optional) scopes both income and item expense to a subset of
// crime names — used by the rotation scheduler's fund-tracking stats to see
// what just the crimes it's allowed to touch are earning/costing, separate
// from the faction's whole OC income line.
export async function getFactionOCProfit(env, factionId, monthStartTs, monthEndTs, crimeNames) {
  const now = new Date();
  const start = monthStartTs ?? Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);
  const end   = monthEndTs   ?? Math.floor(now.getTime() / 1000);
  const nameFilter = Array.isArray(crimeNames) && crimeNames.length
    ? { sql: ` AND name IN (${crimeNames.map(() => '?').join(',')})`, params: crimeNames }
    : { sql: '', params: [] };

  const { results: successfulCrimes } = await env.DB.prepare(
    `SELECT id, rewards_json FROM oc_crimes WHERE faction_id = ? AND status = 'Successful' AND rewards_json IS NOT NULL${nameFilter.sql}`
  ).bind(factionId, ...nameFilter.params).all();

  let paidCrimes = 0;
  let grossIncome = 0;
  for (const row of successfulCrimes) {
    let rewards;
    try { rewards = JSON.parse(row.rewards_json); } catch { continue; }
    const payout = rewards?.payout;
    if (!payout?.paid_at || payout.paid_at < start || payout.paid_at > end) continue;
    const money = rewards.money || 0;
    if (!money) continue;

    const memberPct = typeof payout.percentage === 'number' ? payout.percentage : 80; // stated policy default
    const factionPct = 100 - memberPct;
    grossIncome += money * (factionPct / 100);
    paidCrimes++;
  }

  // Every crime (Successful or Failure) that finished in the target month —
  // item expense is real regardless of whether the crime itself succeeded.
  const { results: completedCrimes } = await env.DB.prepare(
    `SELECT id FROM oc_crimes
     WHERE faction_id = ? AND status IN ('Successful','Failure') AND executed_at >= ? AND executed_at <= ?${nameFilter.sql}`
  ).bind(factionId, start, end, ...nameFilter.params).all();
  const completedIds = completedCrimes.map(c => c.id);

  // Non-reusable, faction-owned items actually consumed (used or lost) on
  // those crimes — this month's real out-of-pocket cost of running them.
  let itemExpense = 0;
  if (completedIds.length) {
    const consumedItems = await fetchInChunks(env, ph => `
      SELECT s.item_id, COALESCE(p.effective_price, 0) AS unit_price
      FROM oc_crime_slots s
      LEFT JOIN item_prices_cache p ON p.item_id = s.item_id
      WHERE s.crime_id IN (${ph})
        AND s.item_reusable = 0
        AND s.item_outcome_owner = 'faction'
        AND s.item_outcome_result IN ('used', 'lost')
    `, completedIds);
    for (const item of consumedItems) itemExpense += item.unit_price || 0;
  }

  const netProfit = grossIncome - itemExpense;

  return {
    paid_crimes: paidCrimes,
    gross_income: Math.round(grossIncome),
    item_expense: Math.round(itemExpense),
    monthly_income: Math.round(netProfit),
    configured: true,
  };
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

// ═══════════════════════════════════════════════════════════════════════════
// OC Rotation Scheduler (testing phase — OCC1 only, scoped to whichever
// crimes leadership enables via the Rotation Config tab)
//
// The problem being solved: members sitting idle for days waiting their turn
// in a half-filled crime wastes far more than it should — the goal is to
// always have a best-available member lined up for the best-available vacant
// slot, filling at most "ongoing + 1" crime instances per crime type at a
// time so new slots don't open faster than the roster can finish them.
//
// This never writes to Torn — it only recommends (`oc_rotation_suggestions`)
// and then, on the next poll, checks what actually happened to that slot.
// ═══════════════════════════════════════════════════════════════════════════

const OCC1_FACTION_ID = 33097; // "could be adapted for the other shells later" — scoped to OCC1 for the testing phase
const ROTATION_POLL_INTERVAL_MIN = 45; // within the requested 30-60 min window
const DEFAULT_PROMOTION_THRESHOLD = 85; // editable per-crime "promotion" bar, distinct from the ordinary suggestion threshold
const ROLE_PROGRESS_DURATION_HOURS = 24; // confirmed duration for the lvl7/lvl8 crimes currently in scope — revisit if a tested crime's roles run a different length
const STAGGER_REMAINING_HOURS = 12; // don't open a crime's next slot until its current slot(s) are within this many hours of finishing
const FORWARD_BOOK_REMAINING_HOURS = 24; // a busy member can still be suggested elsewhere if their current slot finishes within this window
const SOON_FREE_HANDICAP = 0.8; // busy-but-soon-free candidates only win a slot over a free candidate if they're this much better (not just equal)
const VIABILITY_COVERAGE_THRESHOLD = 0.5; // min fraction of a new crime's total position weight we need a plausible candidate for before starting it
const OVERQUALIFIED_HANDICAP = 0.5; // a member already eligible for a HIGHER tier is only used on a lower-tier slot if nobody else is available for it
const MAX_TIER_PUSH_DOWN = 1; // hard cap — never propose a member for a slot more than this many tiers below their proven max

// Shared "who's free, who's soon-free, who's excluded" — used by both the
// matching engine and the roster outlook, so the two always agree.
async function getMemberAvailability(env) {
  // `progress` only means anything during Recruiting — it's each member's
  // own 0-100% checkpoint-build timer since they joined. The MOMENT a crime
  // flips to Planning, that field goes stale/meaningless (confirmed on
  // production data: Planning slots sit at progress=0 or 100 with nothing
  // in between, regardless of how close the crime actually is to finishing)
  // — Planning has its own entirely different clock, `ready_at` on the
  // crime itself. Using progress for Planning slots was wildly overcounting
  // "soon free" members (every stale progress=0 Planning slot looked like
  // "just started, free in 24h" when the real remaining time could be days).
  const { results: busyRows } = await env.DB.prepare(
    `SELECT s.torn_user_id, c.status, s.progress, c.ready_at
     FROM oc_crime_slots s JOIN oc_crimes c ON c.id = s.crime_id
     WHERE c.status IN ('Recruiting','Planning') AND s.torn_user_id IS NOT NULL`
  ).all();

  const nowTs = Math.floor(Date.now() / 1000);
  function remainingHoursForBusyRow(row) {
    if (row.status === 'Planning') {
      if (!row.ready_at) return Infinity; // unknown — never assume "about to free"
      return Math.max(0, (row.ready_at - nowTs) / 3600);
    }
    return remainingHoursForProgress(row.progress);
  }

  const remainingByMember = new Map();
  for (const row of busyRows) {
    const hours = remainingHoursForBusyRow(row);
    const existing = remainingByMember.get(row.torn_user_id);
    if (existing === undefined || hours < existing) remainingByMember.set(row.torn_user_id, hours);
  }
  const excludedBusyIds = new Set([...remainingByMember].filter(([, h]) => h > FORWARD_BOOK_REMAINING_HOURS).map(([uid]) => uid));
  const soonFreeIds = new Set([...remainingByMember].filter(([, h]) => h <= FORWARD_BOOK_REMAINING_HOURS).map(([uid]) => uid));

  const { results: members } = await env.DB.prepare(
    `SELECT torn_user_id, username FROM faction_members WHERE faction_id = ? AND is_active = 1`
  ).bind(OCC1_FACTION_ID).all();
  const freeNowIds = new Set(members.map(m => m.torn_user_id).filter(id => !excludedBusyIds.has(id) && !soonFreeIds.has(id)));
  const availableIds = new Set(members.map(m => m.torn_user_id).filter(id => !excludedBusyIds.has(id))); // free + soon-free

  return { members, freeNowIds, soonFreeIds, excludedBusyIds, availableIds, remainingByMember };
}

// The highest ENABLED-crime tier each member directly clears (best_pass_rate
// >= that crime's own threshold for at least one position) — used to avoid
// using a tier-8-proven member on a tier-7 slot unless nobody else is around.
async function getMemberMaxDirectTier(env, configByName, nameToDifficulty) {
  const { results: cprRows } = await env.DB.prepare(
    `SELECT torn_user_id, crime_name, best_pass_rate FROM oc_member_cpr`
  ).all();
  const maxTier = new Map();
  for (const row of cprRows) {
    const cfg = configByName.get(row.crime_name);
    if (!cfg || row.best_pass_rate < cfg.min_pass_rate) continue;
    const difficulty = nameToDifficulty.get(row.crime_name);
    if (difficulty == null) continue;
    if (difficulty > (maxTier.get(row.torn_user_id) ?? 0)) maxTier.set(row.torn_user_id, difficulty);
  }
  return maxTier;
}

// Torn's slot `progress` is 0-100 over ROLE_PROGRESS_DURATION_HOURS since joining.
function remainingHoursForProgress(progress) {
  const pct = typeof progress === 'number' ? progress : 0;
  return Math.max(0, ROLE_PROGRESS_DURATION_HOURS * (1 - pct / 100));
}

// Policy defaults from the user's stated thresholds — only used when a crime
// has no row yet in oc_rotation_config (or no override set on its row).
function defaultThresholdForCrime(difficulty, crimeName) {
  if (difficulty == null) return 70;
  if (difficulty <= 6) return 70;
  if (difficulty === 7) return 65;
  if (difficulty === 8) return crimeName === 'Clinical Precision' ? 60 : 65;
  return 65; // 9+ wasn't given an explicit figure — defaults alongside lvl7/other-lvl8, editable per crime in Config
}

async function getCrimeNameDifficultyMap(env) {
  const { results } = await env.DB.prepare(`SELECT DISTINCT name, difficulty FROM oc_crimes WHERE difficulty IS NOT NULL`).all();
  const map = new Map();
  for (const r of results) if (!map.has(r.name)) map.set(r.name, r.difficulty);
  return map;
}

// ── GET /api/leadership/oc/rotation/config ────────────────────────────────────
// Every crime Torn has shown us at difficulty 5-9, with its testing-phase
// toggle + threshold (falling back to the policy default until leadership
// sets one). New crime names appear automatically once the OC cron has seen
// them — same "shows up with a sane default, edit if you want to override"
// pattern as the weights Config tab.
export async function getRotationConfig(request, env, user) {
  try {
    const nameToDifficulty = await getCrimeNameDifficultyMap(env);
    const { results: configRows } = await env.DB.prepare(`SELECT * FROM oc_rotation_config`).all();
    const configByName = new Map(configRows.map(r => [r.crime_name, r]));

    const crimes = [...nameToDifficulty.entries()]
      .filter(([, difficulty]) => difficulty >= 5 && difficulty <= 9)
      .map(([crime_name, difficulty]) => {
        const cfg = configByName.get(crime_name);
        return {
          crime_name,
          difficulty,
          enabled: !!cfg?.enabled,
          // Suggestion threshold — the ordinary "good enough to be suggested
          // for a slot in this crime" bar.
          min_pass_rate: cfg?.min_pass_rate ?? defaultThresholdForCrime(difficulty, crime_name),
          is_default: cfg?.min_pass_rate == null,
          // Promotion threshold — the bar on a member's AVERAGE pass rate
          // across all tier-(difficulty-1) crimes/positions they have history
          // for, to earn a one-off trial pick into a below-average-weight
          // slot of THIS crime (to gauge them, before any real data exists).
          promotion_pass_rate: cfg?.promotion_pass_rate ?? DEFAULT_PROMOTION_THRESHOLD,
          promotion_is_default: cfg?.promotion_pass_rate == null,
        };
      })
      .sort((a, b) => a.difficulty - b.difficulty || a.crime_name.localeCompare(b.crime_name));

    return jsonResponse({ crimes });
  } catch (e) {
    console.error('getRotationConfig error:', e);
    return errorResponse('Failed to fetch rotation config: ' + e.message, 500);
  }
}

// ── POST /api/leadership/oc/rotation/config ───────────────────────────────────
// Body: { updates: [{ crime_name, difficulty, enabled, min_pass_rate, promotion_pass_rate }, ...] }
export async function updateRotationConfig(request, env, user) {
  try {
    const { updates } = await request.json();
    if (!Array.isArray(updates) || !updates.length) return errorResponse('updates array is required', 400);
    if (updates.length > 200) return errorResponse('Max 200 updates per request', 400);

    const stmts = updates.map(u => env.DB.prepare(
      `INSERT INTO oc_rotation_config (crime_name, difficulty, enabled, min_pass_rate, promotion_pass_rate, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
       ON CONFLICT(crime_name) DO UPDATE SET
         difficulty = excluded.difficulty,
         enabled = excluded.enabled,
         min_pass_rate = excluded.min_pass_rate,
         promotion_pass_rate = excluded.promotion_pass_rate,
         updated_at = CURRENT_TIMESTAMP,
         updated_by = excluded.updated_by`
    ).bind(
      u.crime_name, Number(u.difficulty) || null, u.enabled ? 1 : 0,
      Number(u.min_pass_rate) || 70, Number(u.promotion_pass_rate) || DEFAULT_PROMOTION_THRESHOLD, user.userId
    ));

    const CHUNK = 200;
    for (let i = 0; i < stmts.length; i += CHUNK) await env.DB.batch(stmts.slice(i, i + CHUNK));

    return jsonResponse({ updated: stmts.length });
  } catch (e) {
    console.error('updateRotationConfig error:', e);
    return errorResponse('Failed to update rotation config: ' + e.message, 500);
  }
}

// Members eligible for a *promotion trial* pick into a specific tier D+1
// crime — per the agreed rule: average their best-known CPR across every
// tier-D crime+position they have history for (ALL of our OC history, not
// just whatever's currently rotation-enabled); if that average clears the
// target crime's own promotion_pass_rate (default 85%, editable per crime —
// distinct from min_pass_rate, which is the ordinary suggestion threshold),
// they're eligible for a trial pick into THAT crime. This is the only way a
// member's first real tier-D+1 CPR data point ever gets created.
// Returns Map<torn_user_id, Map<targetCrimeName, avgScoreAtSourceTier>>.
async function getPromotionEligibility(env, configByName, nameToDifficulty) {
  const { results: cprRows } = await env.DB.prepare(
    `SELECT torn_user_id, crime_name, position, best_pass_rate FROM oc_member_cpr`
  ).all();

  const byMemberTier = new Map(); // torn_user_id -> difficulty -> { sum, count }
  for (const row of cprRows) {
    const difficulty = nameToDifficulty.get(row.crime_name);
    if (difficulty == null) continue;
    const tiers = byMemberTier.get(row.torn_user_id) ?? new Map();
    const stat = tiers.get(difficulty) ?? { sum: 0, count: 0 };
    stat.sum += row.best_pass_rate;
    stat.count++;
    tiers.set(difficulty, stat);
    byMemberTier.set(row.torn_user_id, tiers);
  }

  const eligible = new Map();
  for (const [crimeName, cfg] of configByName) {
    const sourceDifficulty = (cfg.difficulty ?? 0) - 1;
    const promotionThreshold = cfg.promotion_pass_rate ?? DEFAULT_PROMOTION_THRESHOLD;
    for (const [torn_user_id, tiers] of byMemberTier) {
      const stat = tiers.get(sourceDifficulty);
      if (!stat || !stat.count) continue;
      const avg = stat.sum / stat.count;
      if (avg < promotionThreshold) continue;
      const targets = eligible.get(torn_user_id) ?? new Map();
      targets.set(crimeName, Math.round(avg * 10) / 10);
      eligible.set(torn_user_id, targets);
    }
  }
  return eligible;
}

// The core matching pass: for every vacant slot in an enabled, in-scope
// crime, find the best available member and write a suggestion. Runs as a
// continuous "best member for best vacant slot" greedy assignment across ALL
// open slots at once — there's deliberately no fixed per-slot fill order.
async function computeRotationSuggestions(env) {
  const { results: configRows } = await env.DB.prepare(`SELECT * FROM oc_rotation_config WHERE enabled = 1`).all();
  if (!configRows.length) return { created: 0, note: 'no crimes enabled in rotation config' };

  const configByName = new Map(configRows.map(r => [r.crime_name, r]));
  const enabledNames = [...configByName.keys()];
  const namePlaceholders = enabledNames.map(() => '?').join(',');

  // Vacant slots across all enabled, currently-Recruiting crimes for OCC1.
  const { results: vacantSlots } = await env.DB.prepare(`
    SELECT s.crime_id, s.position, s.position_id, s.position_label, s.position_number,
           c.name AS crime_name, c.difficulty
    FROM oc_crime_slots s JOIN oc_crimes c ON c.id = s.crime_id
    WHERE c.faction_id = ? AND c.status = 'Recruiting' AND s.torn_user_id IS NULL
      AND c.name IN (${namePlaceholders})
  `).bind(OCC1_FACTION_ID, ...enabledNames).all();
  if (!vacantSlots.length) return { created: 0, note: 'no vacant slots in enabled crimes' };

  // Member availability, CPR, weights and promotion eligibility — gathered
  // up front so the "should we even start a new crime" viability check below
  // can use the exact same candidate pools as the matching pass further down.
  const availability = await getMemberAvailability(env);
  const { availableIds, soonFreeIds } = availability;
  if (!availableIds.size) return { created: 0, note: 'no available (non-busy, active) members' };
  const scoreMultiplier = uid => soonFreeIds.has(uid) ? SOON_FREE_HANDICAP : 1;

  const { results: cprRows } = await env.DB.prepare(
    `SELECT torn_user_id, crime_name, position, best_pass_rate FROM oc_member_cpr WHERE crime_name IN (${namePlaceholders})`
  ).bind(...enabledNames).all();
  const cprByCrimePosition = new Map(); // `${crime_name}|${position}` -> [{torn_user_id, best_pass_rate}]
  for (const row of cprRows) {
    const key = `${row.crime_name}|${row.position}`;
    (cprByCrimePosition.get(key) ?? cprByCrimePosition.set(key, []).get(key))
      .push({ torn_user_id: row.torn_user_id, best_pass_rate: row.best_pass_rate });
  }

  const { results: weightRows } = await env.DB.prepare(
    `SELECT crime_name, position, position_number, weight FROM oc_position_weights WHERE crime_name IN (${namePlaceholders})`
  ).bind(...enabledNames).all();
  const weightMap = new Map(weightRows.map(w => [`${w.crime_name}|${w.position}|${w.position_number}`, w.weight]));

  // Average weight per crime (from the SAME per-slot weights leadership
  // already tunes on the Config tab's weights editor) — a trial/promotion
  // pick is only ever offered a below-average-weight slot, so an unproven
  // member is never put straight into a make-or-break role to "gauge their
  // success rate".
  const weightSumByCrime = new Map(); // crime_name -> { sum, count }
  for (const w of weightRows) {
    const stat = weightSumByCrime.get(w.crime_name) ?? { sum: 0, count: 0 };
    stat.sum += w.weight; stat.count++;
    weightSumByCrime.set(w.crime_name, stat);
  }
  const avgWeightByCrime = new Map([...weightSumByCrime].map(([name, s]) => [name, s.sum / s.count]));

  // A member who already has ANY CPR record for this exact crime+position —
  // win or lose — is never a trial candidate for it again: trial picks only
  // exist to create a FIRST data point. If that first result came in under
  // the crime's own min_pass_rate, they simply fall out of the direct
  // candidate pool (below) and are never re-offered that role.
  const hasCprForSlot = new Set(cprRows.map(r => `${r.torn_user_id}|${r.crime_name}|${r.position}`));

  const nameToDifficulty = await getCrimeNameDifficultyMap(env);
  const promotionEligibility = await getPromotionEligibility(env, configByName, nameToDifficulty);
  const maxDirectTierByMember = await getMemberMaxDirectTier(env, configByName, nameToDifficulty);

  // Weight-coverage viability check for STARTING a brand-new (fully vacant)
  // crime instance: what fraction of the crime's total position weight do we
  // currently have a plausible candidate for (free/soon-free member clearing
  // the threshold directly, or promotion-eligible for a position they
  // haven't tried)? Below VIABILITY_COVERAGE_THRESHOLD, don't open a new one
  // this pass — better to wait than sink a slot into a crime we can't
  // realistically staff. Already-ongoing instances are never re-evaluated by
  // this — once started, they're carried through regardless.
  const maxWeightByCrimePosition = new Map(); // `${crime_name}|${position}` -> maxWeight across its numbered slots
  for (const w of weightRows) {
    const key = `${w.crime_name}|${w.position}`;
    maxWeightByCrimePosition.set(key, Math.max(maxWeightByCrimePosition.get(key) ?? 0, w.weight));
  }
  const positionsByCrime = new Map(); // crime_name -> Set<position>
  for (const w of weightRows) (positionsByCrime.get(w.crime_name) ?? positionsByCrime.set(w.crime_name, new Set()).get(w.crime_name)).add(w.position);

  function hasPlausibleCandidate(crimeName, position, threshold) {
    const direct = (cprByCrimePosition.get(`${crimeName}|${position}`) ?? [])
      .some(c => availableIds.has(c.torn_user_id) && c.best_pass_rate >= threshold);
    if (direct) return true;
    for (const [uid, targets] of promotionEligibility) {
      if (availableIds.has(uid) && targets.has(crimeName) && !hasCprForSlot.has(`${uid}|${crimeName}|${position}`)) return true;
    }
    return false;
  }

  function isViableNewCrime(crimeName) {
    const positions = positionsByCrime.get(crimeName);
    if (!positions || !positions.size) return true; // no weight data synced yet — don't block on missing data
    const threshold = configByName.get(crimeName).min_pass_rate;
    let totalWeight = 0, coveredWeight = 0;
    for (const position of positions) {
      const weight = maxWeightByCrimePosition.get(`${crimeName}|${position}`) ?? 100;
      totalWeight += weight;
      if (hasPlausibleCandidate(crimeName, position, threshold)) coveredWeight += weight;
    }
    return totalWeight > 0 ? (coveredWeight / totalWeight) >= VIABILITY_COVERAGE_THRESHOLD : true;
  }

  // "Ongoing + 1" throughput cap: per crime_name, every instance with at
  // least one filled slot counts as ongoing (always allowed, to keep it
  // moving toward Planning); a brand-new, fully-vacant instance is only
  // added as the "+1" if it clears the viability check above.
  const { results: fillInfo } = await env.DB.prepare(`
    SELECT c.id AS crime_id, c.name AS crime_name,
           COUNT(*) AS total_slots,
           SUM(CASE WHEN s.torn_user_id IS NOT NULL THEN 1 ELSE 0 END) AS filled_slots
    FROM oc_crime_slots s JOIN oc_crimes c ON c.id = s.crime_id
    WHERE c.faction_id = ? AND c.status = 'Recruiting' AND c.name IN (${namePlaceholders})
    GROUP BY c.id
  `).bind(OCC1_FACTION_ID, ...enabledNames).all();

  const allowedCrimeIds = new Set();
  const byCrimeName = new Map();
  for (const row of fillInfo) (byCrimeName.get(row.crime_name) ?? byCrimeName.set(row.crime_name, []).get(row.crime_name)).push(row);
  for (const instances of byCrimeName.values()) {
    const fresh = instances.filter(i => i.filled_slots === 0).sort((a, b) => a.crime_id - b.crime_id);
    for (const i of instances) if (i.filled_slots > 0) allowedCrimeIds.add(i.crime_id);
    if (fresh.length && isViableNewCrime(fresh[0].crime_name)) allowedCrimeIds.add(fresh[0].crime_id);
  }

  // Only one outstanding suggestion per crime at a time — a crime that
  // already has a pending suggestion isn't offered a second one until that
  // one resolves (joined, superseded, etc).
  const { results: pendingCrimes } = await env.DB.prepare(
    `SELECT DISTINCT crime_id FROM oc_rotation_suggestions WHERE status = 'pending'`
  ).all();
  const crimesWithPendingSuggestion = new Set(pendingCrimes.map(r => r.crime_id));
  for (const id of crimesWithPendingSuggestion) allowedCrimeIds.delete(id);

  // Stagger gate: don't open a crime's NEXT slot until every slot it already
  // has filled is within STAGGER_REMAINING_HOURS of finishing — keeps at most
  // one slot "fresh" at a time per crime instead of flooding it with joins.
  const { results: filledSlotProgress } = await env.DB.prepare(`
    SELECT s.crime_id, s.progress
    FROM oc_crime_slots s JOIN oc_crimes c ON c.id = s.crime_id
    WHERE c.faction_id = ? AND c.status = 'Recruiting' AND c.name IN (${namePlaceholders}) AND s.torn_user_id IS NOT NULL
  `).bind(OCC1_FACTION_ID, ...enabledNames).all();
  const notReadyCrimeIds = new Set(
    filledSlotProgress.filter(s => remainingHoursForProgress(s.progress) > STAGGER_REMAINING_HOURS).map(s => s.crime_id)
  );
  for (const id of notReadyCrimeIds) allowedCrimeIds.delete(id);

  const inScopeSlots = vacantSlots.filter(s => allowedCrimeIds.has(s.crime_id));
  if (!inScopeSlots.length) return { created: 0, note: 'no crime is currently due its next slot (cap, pending suggestion, stagger, or viability gate)' };

  // Direct candidate pairs (member already has CPR for this exact crime+position).
  const pairs = [];
  for (const slot of inScopeSlots) {
    const cfg = configByName.get(slot.crime_name);
    const threshold = cfg.min_pass_rate;
    const weight = weightMap.get(`${slot.crime_name}|${slot.position}|${slot.position_number}`) ?? 100;
    const candidates = cprByCrimePosition.get(`${slot.crime_name}|${slot.position}`) ?? [];
    for (const c of candidates) {
      if (!availableIds.has(c.torn_user_id)) continue;
      if (c.best_pass_rate < threshold) continue;
      const maxTier = maxDirectTierByMember.get(c.torn_user_id) ?? 0;
      if (maxTier - slot.difficulty > MAX_TIER_PUSH_DOWN) continue; // never more than 1 tier below what they're proven at
      const isOverqualified = maxTier > slot.difficulty;
      const score = c.best_pass_rate * (weight / 100) * scoreMultiplier(c.torn_user_id) * (isOverqualified ? OVERQUALIFIED_HANDICAP : 1);
      pairs.push({ slot, torn_user_id: c.torn_user_id, score, pass_rate_used: c.best_pass_rate, is_trial: false });
    }
  }
  pairs.sort((a, b) => b.score - a.score);

  const usedSlotIds = new Set();
  const usedMembers = new Set();
  const usedCrimeIds = new Set(); // only one suggestion per crime per pass
  const assignments = [];
  const slotKeyOf = s => `${s.crime_id}|${s.position_id}`;

  for (const p of pairs) {
    const key = slotKeyOf(p.slot);
    if (usedSlotIds.has(key) || usedMembers.has(p.torn_user_id) || usedCrimeIds.has(p.slot.crime_id)) continue;
    usedSlotIds.add(key);
    usedMembers.add(p.torn_user_id);
    usedCrimeIds.add(p.slot.crime_id);
    assignments.push(p);
  }

  // Trial/promotion picks — only for slots that (a) had zero direct
  // candidates at all (never for a slot that just lost a contested draft to
  // a better pick) and (b) sit at or below this crime's average slot
  // weight, so an unproven member is only ever risked on a low-impact role.
  const slotsWithAnyDirectCandidate = new Set(pairs.map(p => slotKeyOf(p.slot)));
  for (const slot of inScopeSlots) {
    const key = slotKeyOf(slot);
    if (usedSlotIds.has(key) || usedCrimeIds.has(slot.crime_id) || slotsWithAnyDirectCandidate.has(key)) continue;

    const slotWeight = weightMap.get(`${slot.crime_name}|${slot.position}|${slot.position_number}`) ?? 100;
    const avgWeight = avgWeightByCrime.get(slot.crime_name) ?? 100;
    if (slotWeight > avgWeight) continue; // reserved for a proven direct candidate, not a trial pick

    const trialPool = [...promotionEligibility.entries()]
      .filter(([uid, targets]) =>
        availableIds.has(uid) && !usedMembers.has(uid) &&
        targets.has(slot.crime_name) && !hasCprForSlot.has(`${uid}|${slot.crime_name}|${slot.position}`))
      .map(([uid, targets]) => ({ torn_user_id: uid, score: targets.get(slot.crime_name) * scoreMultiplier(uid) }))
      .sort((a, b) => b.score - a.score);

    if (trialPool.length) {
      const pick = trialPool[0];
      usedSlotIds.add(key);
      usedMembers.add(pick.torn_user_id);
      usedCrimeIds.add(slot.crime_id);
      assignments.push({ slot, torn_user_id: pick.torn_user_id, score: pick.score, pass_rate_used: null, is_trial: true });
    }
  }

  let created = 0;
  for (const a of assignments) {
    const existing = await env.DB.prepare(
      `SELECT id, torn_user_id FROM oc_rotation_suggestions WHERE crime_id = ? AND position_id = ? AND status = 'pending'`
    ).bind(a.slot.crime_id, a.slot.position_id).first();

    if (existing?.torn_user_id === a.torn_user_id) continue; // already suggested, unchanged

    if (existing) {
      await env.DB.prepare(
        `UPDATE oc_rotation_suggestions SET status = 'superseded', resolved_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(existing.id).run();
    }

    await env.DB.prepare(
      `INSERT INTO oc_rotation_suggestions
         (faction_id, crime_id, crime_name, position, position_id, position_label, torn_user_id, pass_rate_used, threshold_used, is_trial_pick)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      OCC1_FACTION_ID, a.slot.crime_id, a.slot.crime_name, a.slot.position, a.slot.position_id, a.slot.position_label,
      a.torn_user_id, a.pass_rate_used, configByName.get(a.slot.crime_name).min_pass_rate, a.is_trial ? 1 : 0
    ).run();
    created++;
  }

  return { created, vacant_in_scope: inScopeSlots.length, assigned: assignments.length };
}

// Checks every still-pending suggestion against the freshest crime/slot data
// and resolves it: did the suggested member join (right slot / a different
// slot in the same crime / not at all), did someone else fill it first, or
// did the crime move past Recruiting with the slot still empty.
async function resolveRotationSuggestions(env) {
  const { results: pending } = await env.DB.prepare(
    `SELECT * FROM oc_rotation_suggestions WHERE status = 'pending'`
  ).all();
  if (!pending.length) return { resolved: 0 };

  let resolved = 0;
  for (const sug of pending) {
    const crime = await env.DB.prepare(`SELECT status FROM oc_crimes WHERE id = ?`).bind(sug.crime_id).first();
    if (!crime) continue;

    const slot = await env.DB.prepare(
      `SELECT torn_user_id FROM oc_crime_slots WHERE crime_id = ? AND position_id = ?`
    ).bind(sug.crime_id, sug.position_id).first();

    let status = null;
    let actualId = null;

    if (slot?.torn_user_id) {
      if (slot.torn_user_id === sug.torn_user_id) {
        status = 'joined_match';
        actualId = slot.torn_user_id;
      } else {
        const elsewhere = await env.DB.prepare(
          `SELECT 1 FROM oc_crime_slots WHERE crime_id = ? AND torn_user_id = ?`
        ).bind(sug.crime_id, sug.torn_user_id).first();
        status = elsewhere ? 'joined_wrong_position' : 'joined_wrong_member';
        actualId = elsewhere ? sug.torn_user_id : slot.torn_user_id;
      }
    } else if (crime.status !== 'Recruiting') {
      status = 'expired_unfilled';
    }

    if (status) {
      await env.DB.prepare(
        `UPDATE oc_rotation_suggestions SET status = ?, actual_torn_user_id = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(status, actualId, sug.id).run();
      resolved++;
    }
  }

  return { resolved };
}

// ── Cron entry point — throttles itself to ROTATION_POLL_INTERVAL_MIN using
// a small meta row, so it can safely be called from a more frequent cron
// (e.g. the existing */10 trigger) without a dedicated schedule entry. ──────
export async function runRotationPollIfDue(env) {
  const row = await env.DB.prepare(`SELECT value FROM oc_rotation_meta WHERE key = 'last_poll_at'`).first();
  const lastRun = row ? new Date(row.value).getTime() : 0;
  if (Date.now() - lastRun < ROTATION_POLL_INTERVAL_MIN * 60 * 1000) {
    return { skipped: true };
  }
  await env.DB.prepare(
    `INSERT INTO oc_rotation_meta (key, value) VALUES ('last_poll_at', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).bind(new Date().toISOString()).run();

  // Only OCC1's live Recruiting/Planning crimes matter here, and those sort
  // first — one page is enough, far cheaper than the full daily 500-crime pull.
  await fetchAndCacheFactionCrimes(env, { factionIds: [OCC1_FACTION_ID], maxPages: 1 });
  const resolution = await resolveRotationSuggestions(env);
  const suggestion = await computeRotationSuggestions(env);

  return { skipped: false, resolution, suggestion };
}

// ── POST /api/admin/oc/rotation/poll ──────────────────────────────────────────
// Manual trigger for testing — runs the poll immediately, ignoring the
// throttle (does NOT touch oc_rotation_meta, so the next scheduled cron tick
// still runs on its normal cadence).
export async function triggerRotationPoll(request, env, user) {
  try {
    await fetchAndCacheFactionCrimes(env, { factionIds: [OCC1_FACTION_ID], maxPages: 1 });
    const resolution = await resolveRotationSuggestions(env);
    const suggestion = await computeRotationSuggestions(env);
    return jsonResponse({ resolution, suggestion, triggeredAt: new Date().toISOString() });
  } catch (e) {
    console.error('triggerRotationPoll error:', e);
    return errorResponse('Rotation poll failed: ' + e.message, 500);
  }
}

// ── POST /api/admin/oc/rotation/reset ─────────────────────────────────────────
// Wipes rotation *test data* only — never touches oc_crimes/oc_crime_slots/
// oc_member_cpr (those are Torn's own history, not ours to delete). Lets
// leadership clear out a noisy testing pass without losing the underlying
// crime/CPR data it was computed from.
// Body: { scope: 'all' | 'pending' | 'resolved' | 'crime', crime_name?,
//         reset_throttle? (default true) }
export async function resetRotationData(request, env, user) {
  try {
    const body = await request.json().catch(() => ({}));
    const scope = body.scope || 'all';
    const resetThrottle = body.reset_throttle !== false;

    let where = '';
    const params = [];
    if (scope === 'pending') {
      where = `WHERE status = 'pending'`;
    } else if (scope === 'resolved') {
      where = `WHERE status != 'pending'`;
    } else if (scope === 'crime') {
      if (!body.crime_name) return errorResponse('crime_name is required for scope=crime', 400);
      where = `WHERE crime_name = ?`;
      params.push(body.crime_name);
    } else if (scope !== 'all') {
      return errorResponse('scope must be one of: all, pending, resolved, crime', 400);
    }

    const { meta } = await env.DB.prepare(`DELETE FROM oc_rotation_suggestions ${where}`).bind(...params).run();

    if (resetThrottle) {
      await env.DB.prepare(`DELETE FROM oc_rotation_meta WHERE key = 'last_poll_at'`).run();
    }

    return jsonResponse({ deleted: meta?.changes ?? 0, scope, throttle_reset: resetThrottle });
  } catch (e) {
    console.error('resetRotationData error:', e);
    return errorResponse('Failed to reset rotation data: ' + e.message, 500);
  }
}

// ── GET /api/leadership/oc/rotation/suggestions?faction_id= ──────────────────
// Pending (actionable now) + most recent 50 resolved, with usernames resolved
// for display.
export async function getRotationSuggestions(request, env, user) {
  try {
    const url = new URL(request.url);
    const factionId = parseInt(url.searchParams.get('faction_id'), 10) || OCC1_FACTION_ID;

    const { results: pending } = await env.DB.prepare(
      `SELECT * FROM oc_rotation_suggestions WHERE faction_id = ? AND status = 'pending' ORDER BY suggested_at DESC`
    ).bind(factionId).all();
    const { results: recent } = await env.DB.prepare(
      `SELECT * FROM oc_rotation_suggestions WHERE faction_id = ? AND status != 'pending'
       ORDER BY resolved_at DESC LIMIT 50`
    ).bind(factionId).all();

    const ids = [...new Set([...pending, ...recent].flatMap(r => [r.torn_user_id, r.actual_torn_user_id].filter(Boolean)))];
    const usernames = {};
    if (ids.length) {
      const rows = await fetchInChunks(env, ph =>
        `SELECT torn_user_id, username FROM faction_members WHERE torn_user_id IN (${ph})`, ids
      );
      for (const row of rows) usernames[row.torn_user_id] = row.username;
    }

    // Per-crime "N/total" progress badge — a slot counts as done once it's
    // actually complete, OR (same logic as the stagger gate) it's filled and
    // within STAGGER_REMAINING_HOURS of finishing, since that's the point at
    // which we'd already be suggesting the next slot.
    const crimeIds = [...new Set([...pending, ...recent].map(r => r.crime_id))];
    const progressByCrime = {};
    if (crimeIds.length) {
      const slotRows = await fetchInChunks(env, ph =>
        `SELECT crime_id, torn_user_id, progress FROM oc_crime_slots WHERE crime_id IN (${ph})`, crimeIds
      );
      const byCrime = new Map();
      for (const row of slotRows) (byCrime.get(row.crime_id) ?? byCrime.set(row.crime_id, []).get(row.crime_id)).push(row);
      for (const [crimeId, slots] of byCrime) {
        const total = slots.length;
        const done = slots.filter(s =>
          s.torn_user_id != null && (s.progress >= 100 || remainingHoursForProgress(s.progress) <= STAGGER_REMAINING_HOURS)
        ).length;
        progressByCrime[crimeId] = { done, total };
      }
    }

    return jsonResponse({ pending, recent, usernames, progress: progressByCrime });
  } catch (e) {
    console.error('getRotationSuggestions error:', e);
    return errorResponse('Failed to fetch rotation suggestions: ' + e.message, 500);
  }
}

// ── GET /api/leadership/oc/rotation/stats?faction_id=&days= ──────────────────
// Headline accuracy/turnover metrics: suggestion outcome breakdown, plus the
// two SLA counts the user cares about most — members currently idle 24h+ and
// vacant slots stalled 24h+ in an enabled, in-scope Recruiting crime.
export async function getRotationStats(request, env, user) {
  try {
    const url = new URL(request.url);
    const factionId = parseInt(url.searchParams.get('faction_id'), 10) || OCC1_FACTION_ID;
    const days = Math.min(parseInt(url.searchParams.get('days'), 10) || 30, 180);
    const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { results: outcomeRows } = await env.DB.prepare(
      `SELECT status, COUNT(*) AS count FROM oc_rotation_suggestions
       WHERE faction_id = ? AND suggested_at >= ? AND status != 'pending'
       GROUP BY status`
    ).bind(factionId, sinceIso).all();
    const outcomes = {};
    let totalResolved = 0;
    for (const row of outcomeRows) { outcomes[row.status] = row.count; totalResolved += row.count; }
    const matched = outcomes.joined_match || 0;
    const successRate = totalResolved ? Math.round((matched / totalResolved) * 1000) / 10 : null;

    const distinctMembers = await env.DB.prepare(
      `SELECT COUNT(DISTINCT torn_user_id) AS n FROM oc_rotation_suggestions WHERE faction_id = ? AND suggested_at >= ?`
    ).bind(factionId, sinceIso).first();

    // Turnover: how much of the active roster cycled through a rotation-
    // suggested slot in the window — a stalled program looks like a small
    // number of repeat members, a healthy one spreads across the roster.
    const activeRoster = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM faction_members WHERE faction_id = ? AND is_active = 1`
    ).bind(factionId).first();
    const rosterSize = activeRoster?.n || 0;
    const turnoverRate = rosterSize ? Math.round(((distinctMembers?.n || 0) / rosterSize) * 1000) / 10 : null;

    // Stalled OCs: counts CRIMES, not slots. A crime is stalled when it still
    // has a vacant slot but nobody is actively progressing any filled slot
    // (every filled slot is either done at 100%, or there are none filled at
    // all) — real activity has stopped. This reflects actual game state only;
    // it does NOT get cleared just because we've proposed a suggestion for it
    // — the OC is still sitting there until someone actually joins.
    const { results: configRows } = await env.DB.prepare(`SELECT crime_name FROM oc_rotation_config WHERE enabled = 1`).all();
    let stalledSlots = 0;
    let stalePending12h = 0;
    let fundTracking = null;
    if (configRows.length) {
      const names = configRows.map(r => r.crime_name);
      const ph = names.map(() => '?').join(',');
      const row = await env.DB.prepare(
        `SELECT COUNT(DISTINCT c.id) AS n FROM oc_crimes c
         WHERE c.faction_id = ? AND c.status = 'Recruiting' AND c.name IN (${ph})
           AND EXISTS (SELECT 1 FROM oc_crime_slots s WHERE s.crime_id = c.id AND s.torn_user_id IS NULL)
           AND NOT EXISTS (SELECT 1 FROM oc_crime_slots s WHERE s.crime_id = c.id AND s.torn_user_id IS NOT NULL AND s.progress < 100)`
      ).bind(factionId, ...names).first();
      stalledSlots = row?.n || 0;

      // Separate signal: a suggestion that's been sitting unresolved 12h+ —
      // "no member waiting to join a viable position for over 12h" — so
      // leadership knows a specific suggestion needs a nudge or a re-pick.
      const twelveHoursAgoIso = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      const staleRow = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM oc_rotation_suggestions
         WHERE faction_id = ? AND status = 'pending' AND suggested_at <= ?`
      ).bind(factionId, twelveHoursAgoIso).first();
      stalePending12h = staleRow?.n || 0;

      // Fund tracking: what just the crimes the scheduler is allowed to touch
      // have actually earned/cost over this same window — separate from the
      // faction's whole OC income line (which also includes non-enabled crimes).
      const sinceTs = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
      const nowTs = Math.floor(Date.now() / 1000);
      const profit = await getFactionOCProfit(env, factionId, sinceTs, nowTs, names);
      fundTracking = {
        paid_crimes: profit.paid_crimes,
        gross_income: profit.gross_income,
        item_expense: profit.item_expense,
        net_income: profit.monthly_income,
      };
    }

    return jsonResponse({
      since: sinceIso,
      total_resolved: totalResolved,
      outcomes,
      success_rate: successRate,
      distinct_members_placed: distinctMembers?.n || 0,
      active_roster_size: rosterSize,
      turnover_rate: turnoverRate,
      stalled_slots_24h: stalledSlots,
      stale_pending_12h: stalePending12h,
      fund_tracking: fundTracking,
    });
  } catch (e) {
    console.error('getRotationStats error:', e);
    return errorResponse('Failed to fetch rotation stats: ' + e.message, 500);
  }
}

// ── GET /api/leadership/oc/rotation/outlook ───────────────────────────────────
// Free/soon-free members with their tested-tier eligibility, plus a per-tier
// "idle labor vs open seats" comparison — purely advisory, since we can't
// spawn OC crimes ourselves; starting a new one in Torn's OC2 is a manual
// leadership action. The point is to flag "you have 15 eligible members
// free soon and 0 open tier-8 seats — consider starting more", without ever
// claiming we did it.
export async function getRotationOutlook(request, env, user) {
  try {
    const { results: configRows } = await env.DB.prepare(`SELECT * FROM oc_rotation_config WHERE enabled = 1`).all();
    if (!configRows.length) return jsonResponse({ free_members: [], soon_free_members: [], tier_recommendations: [] });

    const configByName = new Map(configRows.map(r => [r.crime_name, r]));
    const enabledNames = [...configByName.keys()];
    const namePlaceholders = enabledNames.map(() => '?').join(',');

    const availability = await getMemberAvailability(env);
    const usernameByMember = new Map(availability.members.map(m => [m.torn_user_id, m.username]));

    const nameToDifficulty = await getCrimeNameDifficultyMap(env);
    const maxDirectTierByMember = await getMemberMaxDirectTier(env, configByName, nameToDifficulty);
    const promotionEligibility = await getPromotionEligibility(env, configByName, nameToDifficulty);

    const describeMember = (uid, extra) => {
      const eligibleTier = maxDirectTierByMember.get(uid) ?? null;
      const promoTargets = promotionEligibility.get(uid);
      const promotableTo = promoTargets
        ? Math.max(...[...promoTargets.keys()].map(name => nameToDifficulty.get(name) ?? 0))
        : null;
      return {
        torn_user_id: uid,
        username: usernameByMember.get(uid) ?? String(uid),
        eligible_tier: eligibleTier,
        promotable_to: promotableTo && (!eligibleTier || promotableTo > eligibleTier) ? promotableTo : null,
        ...extra,
      };
    };

    const freeMembers = [...availability.freeNowIds]
      .map(uid => describeMember(uid))
      .filter(m => m.eligible_tier != null || m.promotable_to != null)
      .sort((a, b) => (b.eligible_tier ?? b.promotable_to ?? 0) - (a.eligible_tier ?? a.promotable_to ?? 0));

    const soonFreeMembers = [...availability.soonFreeIds]
      .map(uid => describeMember(uid, { hours_remaining: Math.round((availability.remainingByMember.get(uid) ?? 0) * 10) / 10 }))
      .filter(m => m.eligible_tier != null || m.promotable_to != null)
      .sort((a, b) => (b.eligible_tier ?? b.promotable_to ?? 0) - (a.eligible_tier ?? a.promotable_to ?? 0));

    // Current active instances + their open seats, per tier.
    const { results: instanceRows } = await env.DB.prepare(`
      SELECT c.id AS crime_id, c.difficulty,
             SUM(CASE WHEN s.torn_user_id IS NULL THEN 1 ELSE 0 END) AS vacant_slots
      FROM oc_crime_slots s JOIN oc_crimes c ON c.id = s.crime_id
      WHERE c.faction_id = ? AND c.status IN ('Recruiting','Planning') AND c.name IN (${namePlaceholders})
      GROUP BY c.id
    `).bind(OCC1_FACTION_ID, ...enabledNames).all();

    const byTier = new Map(); // difficulty -> { activeInstances, openCapacity }
    for (const row of instanceRows) {
      const stat = byTier.get(row.difficulty) ?? { activeInstances: 0, openCapacity: 0 };
      stat.activeInstances++;
      stat.openCapacity += row.vacant_slots;
      byTier.set(row.difficulty, stat);
    }

    const eligibleFreeByTier = new Map();
    const eligibleSoonByTier = new Map();
    for (const m of freeMembers) {
      const tier = m.eligible_tier ?? m.promotable_to;
      eligibleFreeByTier.set(tier, (eligibleFreeByTier.get(tier) ?? 0) + 1);
    }
    for (const m of soonFreeMembers) {
      const tier = m.eligible_tier ?? m.promotable_to;
      eligibleSoonByTier.set(tier, (eligibleSoonByTier.get(tier) ?? 0) + 1);
    }

    const allTiers = new Set([...byTier.keys(), ...eligibleFreeByTier.keys(), ...eligibleSoonByTier.keys()]);
    const tierRecommendations = [...allTiers].sort((a, b) => a - b).map(difficulty => {
      const stat = byTier.get(difficulty) ?? { activeInstances: 0, openCapacity: 0 };
      const eligibleFree = eligibleFreeByTier.get(difficulty) ?? 0;
      const eligibleSoon = eligibleSoonByTier.get(difficulty) ?? 0;
      const idleLabor = eligibleFree + eligibleSoon;
      const recommendSpawn = idleLabor > stat.openCapacity;
      return {
        difficulty,
        active_instances: stat.activeInstances,
        open_capacity: stat.openCapacity,
        eligible_free: eligibleFree,
        eligible_soon_free: eligibleSoon,
        recommend_spawn: recommendSpawn,
        reason: recommendSpawn
          ? `${idleLabor} eligible free/soon-free vs ${stat.openCapacity} open seat${stat.openCapacity !== 1 ? 's' : ''}`
          : null,
      };
    });

    return jsonResponse({ free_members: freeMembers, soon_free_members: soonFreeMembers, tier_recommendations: tierRecommendations });
  } catch (e) {
    console.error('getRotationOutlook error:', e);
    return errorResponse('Failed to fetch rotation outlook: ' + e.message, 500);
  }
}
