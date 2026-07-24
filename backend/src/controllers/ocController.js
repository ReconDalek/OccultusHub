import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { getStaffApiKeyForFaction, fetchWithRetry } from '../services/tornApiService.js';

const FACTION_IDS = [33097, 9728, 9171];
const TORN_API_BASE = 'https://api.torn.com/v2';
const MAX_PAGES = 5; // 500 crimes per faction per run — plenty of headroom over a day's activity

const BUCKET_STATUSES = {
  recruiting: ['Recruiting'],
  planning: ['Planning'],
  completed: ['Successful', 'Failure', 'Expired'],
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

    // Resolve required item names + prices for display
    const itemIds = [...new Set(slots.map(s => s.item_id).filter(Boolean))];
    const itemNameMap = {};
    const itemPriceMap = {};
    if (itemIds.length) {
      const items = await fetchInChunks(env, ph => `SELECT item_id, name, effective_price FROM item_prices_cache WHERE item_id IN (${ph})`, itemIds);
      for (const i of items) { itemNameMap[i.item_id] = i.name; itemPriceMap[i.item_id] = i.effective_price; }
    }

    const enriched = crimes.map(c => ({
      ...c,
      rewards: c.rewards_json ? JSON.parse(c.rewards_json) : null,
      slots: (slotsByCrime[c.id] || []).map(s => ({
        ...s,
        username: s.torn_user_id ? (memberMap[s.torn_user_id] ?? `#${s.torn_user_id}`) : null,
        item_name: s.item_id ? (itemNameMap[s.item_id] ?? `Item #${s.item_id}`) : null,
        item_unit_price: s.item_id ? (itemPriceMap[s.item_id] ?? 0) : 0,
      })),
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

// Empirical importance of each individual slot instance to a crime's overall
// success — derived from real history, not guessed. Same crime + same bare
// position can have very different real weights per slot number (e.g. Break
// the Bank's "Muscle #1" vs "Muscle #2" vs "Muscle #3"), so this groups by
// (position, position_number) rather than by bare position. For each slot,
// compares the crime's overall success rate in runs where that specific
// slot's own outcome succeeded vs runs where it didn't; the gap (in
// percentage points, floored at 0) is the "weight". Needs at least 3 samples
// on both sides to be trusted, else 0 (treated as "no signal", not
// "unimportant").
async function computePositionWeights(env, crimeName) {
  const { results } = await env.DB.prepare(
    `SELECT s.position, s.position_number,
            SUM(CASE WHEN s.outcome = 'Successful' AND c.status = 'Successful' THEN 1 ELSE 0 END) AS pos_succ_crime_succ,
            SUM(CASE WHEN s.outcome = 'Successful' THEN 1 ELSE 0 END)                              AS pos_succ_total,
            SUM(CASE WHEN s.outcome != 'Successful' AND c.status = 'Successful' THEN 1 ELSE 0 END) AS pos_fail_crime_succ,
            SUM(CASE WHEN s.outcome != 'Successful' THEN 1 ELSE 0 END)                             AS pos_fail_total
     FROM oc_crime_slots s
     JOIN oc_crimes c ON c.id = s.crime_id
     WHERE c.name = ? AND c.status IN ('Successful','Failure')
       AND s.torn_user_id IS NOT NULL AND s.outcome IS NOT NULL AND s.position_number IS NOT NULL
     GROUP BY s.position, s.position_number`
  ).bind(crimeName).all();

  const weights = {}; // key = `${position}|${position_number}` -> weight
  for (const row of results) {
    const key = `${row.position}|${row.position_number}`;
    if (row.pos_succ_total < 3 || row.pos_fail_total < 3) { weights[key] = 0; continue; }
    const succRate = row.pos_succ_crime_succ / row.pos_succ_total;
    const failRate = row.pos_fail_crime_succ / row.pos_fail_total;
    weights[key] = Math.max(0, Math.round((succRate - failRate) * 1000) / 10);
  }
  return weights;
}

// Keeps oc_position_weights in sync with reality: seeds any newly-seen
// crime/slot combo (new Torn crime types show up automatically, no manual
// entry needed) and refreshes empirically-derived weights for every row
// leadership hasn't manually overridden. Rows with auto_computed = 0 are
// never touched here again until leadership resets them.
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
     VALUES (?, ?, ?, ?, 0, 1)`
  ).bind(s.crime_name, s.position, s.position_number, s.position_label));
  for (let i = 0; i < seedStmts.length; i += CHUNK) await env.DB.batch(seedStmts.slice(i, i + CHUNK));

  // Refresh empirical weights per crime, only for rows still auto-computed.
  const crimeNames = [...new Set(slotDefs.map(s => s.crime_name))];
  const updateStmts = [];
  for (const crimeName of crimeNames) {
    const weights = await computePositionWeights(env, crimeName);
    for (const [key, weight] of Object.entries(weights)) {
      const [position, positionNumber] = key.split('|');
      updateStmts.push(env.DB.prepare(
        `UPDATE oc_position_weights SET weight = ?, updated_at = CURRENT_TIMESTAMP
         WHERE crime_name = ? AND position = ? AND position_number = ? AND auto_computed = 1`
      ).bind(weight, crimeName, position, Number(positionNumber)));
    }
  }
  for (let i = 0; i < updateStmts.length; i += CHUNK) await env.DB.batch(updateStmts.slice(i, i + CHUNK));
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
    .map(s => ({ ...s, weight: weightMap[`${s.position}|${s.position_number}`] ?? 0 }))
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
export async function getFactionOCProfit(env, factionId) {
  const now = new Date();
  const monthStartTs = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);

  const { results: successfulCrimes } = await env.DB.prepare(
    `SELECT id, rewards_json FROM oc_crimes WHERE faction_id = ? AND status = 'Successful' AND rewards_json IS NOT NULL`
  ).bind(factionId).all();

  let paidCrimes = 0;
  let grossIncome = 0;
  for (const row of successfulCrimes) {
    let rewards;
    try { rewards = JSON.parse(row.rewards_json); } catch { continue; }
    const payout = rewards?.payout;
    if (!payout?.paid_at || payout.paid_at < monthStartTs) continue;
    const money = rewards.money || 0;
    if (!money) continue;

    const memberPct = typeof payout.percentage === 'number' ? payout.percentage : 80; // stated policy default
    const factionPct = 100 - memberPct;
    grossIncome += money * (factionPct / 100);
    paidCrimes++;
  }

  // Every crime (Successful or Failure) that finished this month — item
  // expense is real regardless of whether the crime itself succeeded.
  const { results: completedCrimes } = await env.DB.prepare(
    `SELECT id FROM oc_crimes
     WHERE faction_id = ? AND status IN ('Successful','Failure') AND executed_at >= ?`
  ).bind(factionId, monthStartTs).all();
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
