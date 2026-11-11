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
          min_pass_rate: cfg?.min_pass_rate ?? defaultThresholdForCrime(difficulty, crime_name),
          is_default: cfg?.min_pass_rate == null,
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
// Body: { updates: [{ crime_name, difficulty, enabled, min_pass_rate }, ...] }
export async function updateRotationConfig(request, env, user) {
  try {
    const { updates } = await request.json();
    if (!Array.isArray(updates) || !updates.length) return errorResponse('updates array is required', 400);
    if (updates.length > 200) return errorResponse('Max 200 updates per request', 400);

    const stmts = updates.map(u => env.DB.prepare(
      `INSERT INTO oc_rotation_config (crime_name, difficulty, enabled, min_pass_rate, updated_at, updated_by)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
       ON CONFLICT(crime_name) DO UPDATE SET
         difficulty = excluded.difficulty,
         enabled = excluded.enabled,
         min_pass_rate = excluded.min_pass_rate,
         updated_at = CURRENT_TIMESTAMP,
         updated_by = excluded.updated_by`
    ).bind(u.crime_name, Number(u.difficulty) || null, u.enabled ? 1 : 0, Number(u.min_pass_rate) || 70, user.userId));

    const CHUNK = 200;
    for (let i = 0; i < stmts.length; i += CHUNK) await env.DB.batch(stmts.slice(i, i + CHUNK));

    return jsonResponse({ updated: stmts.length });
  } catch (e) {
    console.error('updateRotationConfig error:', e);
    return errorResponse('Failed to update rotation config: ' + e.message, 500);
  }
}

// Members eligible for a *trial* pick one tier above the highest tier they
// have real CPR history for — per the agreed rule: if a member clears the
// configured threshold on a majority of the crime+position combos they have
// data for at tier D, they're allowed to be proposed (without a threshold
// check, since there's no data yet) for tier D+1. This is the only way a
// member's first real tier-D+1 CPR data point ever gets created.
// Returns Map<torn_user_id, Map<targetDifficulty, avgScoreAtLowerTier>>.
async function getTrialEligibility(env, configByName, nameToDifficulty) {
  const { results: cprRows } = await env.DB.prepare(
    `SELECT torn_user_id, crime_name, position, best_pass_rate FROM oc_member_cpr`
  ).all();

  const byMember = new Map(); // torn_user_id -> difficulty -> { clear, total, sum }
  for (const row of cprRows) {
    const difficulty = nameToDifficulty.get(row.crime_name);
    if (difficulty == null) continue;
    const cfg = configByName.get(row.crime_name);
    const threshold = cfg ? cfg.min_pass_rate : defaultThresholdForCrime(difficulty, row.crime_name);

    const tiers = byMember.get(row.torn_user_id) ?? new Map();
    const stat = tiers.get(difficulty) ?? { clear: 0, total: 0, sum: 0 };
    stat.total++;
    stat.sum += row.best_pass_rate;
    if (row.best_pass_rate >= threshold) stat.clear++;
    tiers.set(difficulty, stat);
    byMember.set(row.torn_user_id, tiers);
  }

  const eligible = new Map();
  for (const [torn_user_id, tiers] of byMember) {
    const targets = new Map();
    for (const [difficulty, stat] of tiers) {
      if (stat.total > 0 && stat.clear / stat.total > 0.5) {
        targets.set(difficulty + 1, Math.round((stat.sum / stat.total) * 10) / 10);
      }
    }
    if (targets.size) eligible.set(torn_user_id, targets);
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

  // "Ongoing + 1" throughput cap: per crime_name, every instance with at
  // least one filled slot counts as ongoing (always allowed, to keep it
  // moving toward Planning); brand-new, fully-vacant instances are capped at
  // one extra so new crimes don't all open for recruitment at once.
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
    if (fresh.length) allowedCrimeIds.add(fresh[0].crime_id);
  }

  const inScopeSlots = vacantSlots.filter(s => allowedCrimeIds.has(s.crime_id));
  if (!inScopeSlots.length) return { created: 0, note: 'all vacant slots are beyond the ongoing+1 cap this pass' };

  // Members currently mid-crime anywhere (Recruiting or Planning) can't be
  // proposed for a second one.
  const { results: busyRows } = await env.DB.prepare(
    `SELECT DISTINCT s.torn_user_id FROM oc_crime_slots s JOIN oc_crimes c ON c.id = s.crime_id
     WHERE c.status IN ('Recruiting','Planning') AND s.torn_user_id IS NOT NULL`
  ).all();
  const busyIds = new Set(busyRows.map(r => r.torn_user_id));

  const { results: members } = await env.DB.prepare(
    `SELECT torn_user_id FROM faction_members WHERE faction_id = ? AND is_active = 1`
  ).bind(OCC1_FACTION_ID).all();
  const availableIds = new Set(members.map(m => m.torn_user_id).filter(id => !busyIds.has(id)));
  if (!availableIds.size) return { created: 0, note: 'no available (non-busy, active) members' };

  const positions = [...new Set(inScopeSlots.map(s => s.position))];
  const posPlaceholders = positions.map(() => '?').join(',');
  const { results: cprRows } = await env.DB.prepare(
    `SELECT torn_user_id, crime_name, position, best_pass_rate FROM oc_member_cpr
     WHERE crime_name IN (${namePlaceholders}) AND position IN (${posPlaceholders})`
  ).bind(...enabledNames, ...positions).all();
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

  const nameToDifficulty = await getCrimeNameDifficultyMap(env);
  const trialEligibility = await getTrialEligibility(env, configByName, nameToDifficulty);

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
      pairs.push({ slot, torn_user_id: c.torn_user_id, score: c.best_pass_rate * (weight / 100), pass_rate_used: c.best_pass_rate, is_trial: false });
    }
  }
  pairs.sort((a, b) => b.score - a.score);

  const usedSlotIds = new Set();
  const usedMembers = new Set();
  const assignments = [];
  const slotKeyOf = s => `${s.crime_id}|${s.position_id}`;

  for (const p of pairs) {
    const key = slotKeyOf(p.slot);
    if (usedSlotIds.has(key) || usedMembers.has(p.torn_user_id)) continue;
    usedSlotIds.add(key);
    usedMembers.add(p.torn_user_id);
    assignments.push(p);
  }

  // Trial picks — only for slots that had zero direct candidates at all
  // (never for a slot that just lost a contested draft to a better pick).
  const slotsWithAnyDirectCandidate = new Set(pairs.map(p => slotKeyOf(p.slot)));
  for (const slot of inScopeSlots) {
    const key = slotKeyOf(slot);
    if (usedSlotIds.has(key) || slotsWithAnyDirectCandidate.has(key)) continue;

    const trialPool = [...trialEligibility.entries()]
      .filter(([uid, targets]) => availableIds.has(uid) && !usedMembers.has(uid) && targets.has(slot.difficulty))
      .map(([uid, targets]) => ({ torn_user_id: uid, score: targets.get(slot.difficulty) }))
      .sort((a, b) => b.score - a.score);

    if (trialPool.length) {
      const pick = trialPool[0];
      usedSlotIds.add(key);
      usedMembers.add(pick.torn_user_id);
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

    return jsonResponse({ pending, recent, usernames });
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

    // Stalled slots: a vacant slot in an enabled crime, open for 24h+ (crime
    // created_at is the closest proxy we have to "slot became available").
    const dayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
    const { results: configRows } = await env.DB.prepare(`SELECT crime_name FROM oc_rotation_config WHERE enabled = 1`).all();
    let stalledSlots = 0;
    let fundTracking = null;
    if (configRows.length) {
      const names = configRows.map(r => r.crime_name);
      const ph = names.map(() => '?').join(',');
      const row = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM oc_crime_slots s JOIN oc_crimes c ON c.id = s.crime_id
         WHERE c.faction_id = ? AND c.status = 'Recruiting' AND s.torn_user_id IS NULL
           AND c.name IN (${ph}) AND c.created_at <= ?`
      ).bind(factionId, ...names, dayAgo).first();
      stalledSlots = row?.n || 0;

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
      fund_tracking: fundTracking,
    });
  } catch (e) {
    console.error('getRotationStats error:', e);
    return errorResponse('Failed to fetch rotation stats: ' + e.message, 500);
  }
}
