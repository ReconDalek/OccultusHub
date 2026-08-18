import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { getRandomUserApiKey, getStaffApiKeyForFaction, fetchWithRetry } from '../services/tornApiService.js';
import { logInfo, logWarn, logError } from '../services/logger.js';
import { parseArmoryEntry, BULK_DEPOSIT_THRESHOLD, suppressSameDayOverdoseXanax } from './warController.js';

const FACTION_IDS  = [33097, 9728, 9171];
const TORN_API_BASE = 'https://api.torn.com/v2';

const MIN_CHAIN_LENGTH = 1000; // Only store chains >= this many hits

// Factions allowed for manual chain import — includes current factions plus
// historical faction IDs we previously owned but no longer actively track.
const ALLOWED_IMPORT_FACTION_IDS = [33097, 9728, 9171, 355];

// ─────────────────────────────────────────────────────────────────────────────
// Internal: fetch chain lists for all factions and upsert only NEW chains
// that meet the minimum hit threshold.
// Called by the weekly cron AND admin force-refresh.
// ─────────────────────────────────────────────────────────────────────────────
export async function fetchAndCacheChains(env, trigger = 'cron') {
  const apiKeyObj = await getRandomUserApiKey(env);
  if (!apiKeyObj?.key) {
    console.error('fetchAndCacheChains: no API key available');
    await logError(env, { category: 'api_error', event: 'chain_cache_no_key', message: 'Chain cache refresh failed: no API key available', meta: { trigger } });
    return { added: 0, skipped: 0, errors: ['No API key available'] };
  }
  const { key: apiKey, tornUserId, username } = apiKeyObj;

  let totalAdded   = 0;
  let totalSkipped = 0;
  const errors     = [];

  for (const factionId of FACTION_IDS) {
    const url = `${TORN_API_BASE}/faction/${factionId}/chains?limit=100&sort=DESC&comment=OccHub`;
    try {
      const data = await fetchWithRetry(url, { Authorization: `ApiKey ${apiKey}` });
      const chains = data.chains || [];
      let added   = 0;
      let skipped = 0;

      for (const chain of chains) {
        // Skip chains below the minimum hit threshold
        if (chain.chain < MIN_CHAIN_LENGTH) {
          skipped++;
          continue;
        }

        const result = await env.DB.prepare(
          `INSERT OR IGNORE INTO chain_cache
             (torn_chain_id, faction_id, chain_length, respect, start_at, end_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
          .bind(chain.id, factionId, chain.chain, chain.respect, chain.start, chain.end)
          .run();

        if (result.meta?.changes > 0) added++;
      }

      totalAdded   += added;
      totalSkipped += skipped;
      console.log(
        `fetchAndCacheChains: faction ${factionId} — ${added} new, ${skipped} below ${MIN_CHAIN_LENGTH} hits (${chains.length} fetched)`
      );
      await logInfo(env, {
        category: 'api_call', event: 'chain_cache_success',
        message: `Chain cache refreshed for faction ${factionId}: ${added} new, ${chains.length} fetched`,
        torn_user_id: tornUserId, username,
        faction_id: factionId,
        meta: { trigger, added, skipped, fetched: chains.length, endpoint: url },
      });
    } catch (err) {
      console.error(`fetchAndCacheChains: faction ${factionId} error:`, err);
      errors.push(`Faction ${factionId}: ${err.message}`);
      await logError(env, {
        category: 'api_error', event: 'chain_cache_failed',
        message: `Chain cache failed for faction ${factionId}: ${err.message}`,
        torn_user_id: tornUserId, username,
        faction_id: factionId,
        meta: { trigger, endpoint: url, error: err.message },
      });
    }
  }

  if (errors.length) {
    await logWarn(env, { category: 'cron', event: 'chain_cache_partial', message: `Chain cache completed with errors: ${errors.join(', ')}`, meta: { trigger, errors } });
  } else {
    await logInfo(env, { category: 'cron', event: 'chain_cache_complete', message: `Chain cache refresh complete: ${totalAdded} new chains added`, meta: { trigger, totalAdded, totalSkipped } });
  }

  return { added: totalAdded, skipped: totalSkipped, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// One-time armory/energy check for a saved chain — same faction/news
// armoryAction endpoint war tracking uses for Energy In, plus the already-
// cached armory_deposits table for Energy Repaid, plus personal_stats_snapshots
// for OD. Only touches members who already have a chain_hits row (the chain's
// known attacker list) — armory usage isn't meaningful for a non-attacker.
//
// Windows:
// - Energy In (Xanax used): 3-day stacking period before chain start through
//   chain end — same "stacking period" shape as war tracking's pre-war window.
// - Energy Repaid (Xanax deposited): same start, but extends a week PAST chain
//   end, since members often return unused stock after the chain winds down
//   rather than during it.
// - OD: over the Energy In window (stacking period through chain end) — OD
//   risk ties to the chain's own active period, not the extended repay window.
// ─────────────────────────────────────────────────────────────────────────────
async function fetchChainEnergyData(env, chain, apiKey) {
  const { torn_chain_id: chainId, faction_id: factionId, start_at: startAt, end_at: endAt } = chain;
  const now = Math.floor(Date.now() / 1000);

  const stackFrom = startAt - 3 * 86400;
  const usageTo    = Math.min(endAt, now);
  const repaidTo    = Math.min(endAt + 7 * 86400, now);

  const { results: hitRows } = await env.DB.prepare(
    `SELECT torn_user_id FROM chain_hits WHERE torn_chain_id=?`
  ).bind(chainId).all();
  const memberIds = new Set((hitRows || []).map(r => r.torn_user_id));
  if (!memberIds.size) return { updated: 0 };

  // ── Energy In: Xanax used, from armoryAction news — paginated ASCENDING
  // (oldest-of-the-window first) starting at `from=stackFrom`, so the actual
  // target window is covered by the first page(s) regardless of how much
  // armoryAction activity has happened since. Follows the Torn v2 API's own
  // cursor (`_metadata.links.next`) for subsequent pages — the endpoint does
  // NOT support an `offset` query param despite accepting it silently; every
  // "page" fetched with a different offset returns the identical first 100
  // items, so an offset-based loop never advances past page 0 at all. Breaks
  // as soon as a page crosses usageTo (ascending order guarantees nothing
  // after that matters) or the cursor runs out.
  const xanaxUsed      = {};
  const xanaxUsedByDay = {}; // { [torn_user_id]: { [date]: count } } — feeds OD suppression below
  // A faction's full armoryAction volume (blood bags, FAKs, boosters — not just
  // Xanax, since Torn's news API can't be filtered any narrower than the whole
  // category) over a 3-day stacking period + chain can run into the thousands
  // for an active ~90-member faction, so this cap is generous. `reachedEnd`
  // below still lets a lighter/shorter window finish in just 1-2 pages.
  const MAX_PAGES = 50; // 5000 news entries
  let nextUrl = `${TORN_API_BASE}/faction/news?striptags=false&limit=100&sort=ASC&from=${stackFrom}&cat=armoryAction&comment=OccHub`;
  for (let page = 0; page < MAX_PAGES && nextUrl; page++) {
    const data = await fetchWithRetry(nextUrl, { Authorization: `ApiKey ${apiKey}` });
    const items = data.news || [];
    if (!items.length) break;
    let reachedEnd = false;
    for (const item of items) {
      if (item.timestamp > usageTo) { reachedEnd = true; break; }
      const parsed = parseArmoryEntry(item.text);
      if (!parsed || parsed.item_name !== 'Xanax') continue;
      if (!memberIds.has(parsed.torn_user_id)) continue;
      xanaxUsed[parsed.torn_user_id] = (xanaxUsed[parsed.torn_user_id] || 0) + 1;
      const day = new Date(item.timestamp * 1000).toISOString().slice(0, 10);
      (xanaxUsedByDay[parsed.torn_user_id] ??= {})[day] = (xanaxUsedByDay[parsed.torn_user_id]?.[day] || 0) + 1;
    }
    if (reachedEnd) break;
    nextUrl = data._metadata?.links?.next || null;
  }

  // ── Energy Repaid: Xanax deposited back, from the already-cached armory_deposits table ──
  const { results: repaidRows } = await env.DB.prepare(
    `SELECT torn_user_id, SUM(quantity) AS total
     FROM armory_deposits
     WHERE faction_id=? AND item_name='Xanax' AND quantity < ?
       AND deposited_at >= ? AND deposited_at <= ?
     GROUP BY torn_user_id`
  ).bind(factionId, BULK_DEPOSIT_THRESHOLD, stackFrom, repaidTo).all();
  const xanaxDeposited = {};
  for (const r of repaidRows || []) if (memberIds.has(r.torn_user_id)) xanaxDeposited[r.torn_user_id] = r.total;

  // ── OD delta over the stacking+chain window ─────────────────────────────
  const fromDate = new Date(stackFrom * 1000).toISOString().slice(0, 10);
  const toDate   = new Date(usageTo * 1000).toISOString().slice(0, 10);
  const [odStartRows, odEndRows] = await Promise.all([
    env.DB.prepare(`
      SELECT p.torn_user_id, CAST(json_extract(p.stats, '$.drugs.overdoses') AS INTEGER) AS val
      FROM personal_stats_snapshots p
      INNER JOIN (
        SELECT torn_user_id, MIN(snapshot_date) AS min_date
        FROM personal_stats_snapshots WHERE snapshot_date >= ? AND snapshot_date <= ? GROUP BY torn_user_id
      ) s ON p.torn_user_id = s.torn_user_id AND p.snapshot_date = s.min_date
    `).bind(fromDate, toDate).all(),
    env.DB.prepare(`
      SELECT p.torn_user_id, CAST(json_extract(p.stats, '$.drugs.overdoses') AS INTEGER) AS val
      FROM personal_stats_snapshots p
      INNER JOIN (
        SELECT torn_user_id, MAX(snapshot_date) AS max_date
        FROM personal_stats_snapshots WHERE snapshot_date >= ? AND snapshot_date <= ? GROUP BY torn_user_id
      ) e ON p.torn_user_id = e.torn_user_id AND p.snapshot_date = e.max_date
    `).bind(fromDate, toDate).all(),
  ]);
  const odStart = {};
  for (const r of odStartRows.results || []) odStart[r.torn_user_id] = r.val ?? 0;
  const overdoses = {};
  for (const r of odEndRows.results || []) {
    if (!memberIds.has(r.torn_user_id)) continue;
    overdoses[r.torn_user_id] = Math.max(0, (r.val ?? 0) - (odStart[r.torn_user_id] ?? 0));
  }

  // Don't credit Energy In for a Xanax immediately followed by an OD the same
  // day — same window as the Xanax-used fetch above (stacking period through
  // chain end).
  let xanaxAdjusted = {};
  if (Object.keys(xanaxUsedByDay).length) {
    xanaxAdjusted = await suppressSameDayOverdoseXanax(env, {
      fromDate, toDate, xanaxByUserDay: xanaxUsedByDay,
    });
  }

  // ── Write back ────────────────────────────────────────────────────────────
  const stmts = [];
  for (const userId of memberIds) {
    const adjustedUsed = xanaxAdjusted[userId] ?? xanaxUsed[userId] ?? 0;
    stmts.push(env.DB.prepare(
      `UPDATE chain_hits SET xanax_used=?, xanax_deposited=?, overdoses=? WHERE torn_chain_id=? AND torn_user_id=?`
    ).bind(adjustedUsed, xanaxDeposited[userId] || 0, overdoses[userId] || 0, chainId, userId));
  }
  stmts.push(env.DB.prepare(`UPDATE chain_cache SET energy_fetched_at=CURRENT_TIMESTAMP WHERE torn_chain_id=?`).bind(chainId));

  const CHUNK = 20;
  for (let i = 0; i < stmts.length; i += CHUNK) {
    await env.DB.batch(stmts.slice(i, i + CHUNK));
  }

  return { updated: memberIds.size };
}

// Best-effort trigger for the one-time energy check right after hits are
// saved — failures here shouldn't fail the save itself (the backfill button
// can always retry later), just get logged.
async function triggerChainEnergyFetch(env, chainId) {
  try {
    const chainRow = await env.DB.prepare(
      `SELECT torn_chain_id, faction_id, start_at, end_at FROM chain_cache WHERE torn_chain_id=?`
    ).bind(chainId).first();
    if (!chainRow) return { fetched: false, reason: 'chain not cached' };

    // Must be a key belonging to THIS chain's faction — faction/news always
    // returns the calling key's own faction, so a key from a different
    // faction would silently scope the whole fetch to the wrong faction and
    // never match this chain's members (previously used getRandomUserApiKey,
    // which picks across all factions with no such guarantee).
    const apiKeyObj = await getStaffApiKeyForFaction(env, chainRow.faction_id);
    if (!apiKeyObj?.key) return { fetched: false, reason: 'no API key available for this faction' };

    const result = await fetchChainEnergyData(env, chainRow, apiKeyObj.key);
    return { fetched: true, updated: result.updated };
  } catch (e) {
    console.error(`triggerChainEnergyFetch: chain ${chainId} failed:`, e.message);
    await logError(env, { category: 'api_error', event: 'chain_energy_fetch_failed', message: `Chain ${chainId} energy fetch failed: ${e.message}`, meta: { chainId } }).catch(() => {});
    return { fetched: false, reason: e.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/leadership/chains?faction_id=XXXXX
// Returns the last 5 chains stored for the given faction.
// Also flags whether member hit data has been saved for each chain.
// ─────────────────────────────────────────────────────────────────────────────
export async function getChains(request, env) {
  try {
    const url      = new URL(request.url);
    const factionId = parseInt(url.searchParams.get('faction_id'), 10);

    if (!factionId || !FACTION_IDS.includes(factionId)) {
      return errorResponse('Invalid or missing faction_id. Valid values: 33097, 9728, 9171', 400);
    }

    const result = await env.DB.prepare(
      `SELECT
         cc.torn_chain_id,
         cc.faction_id,
         cc.chain_length,
         cc.respect,
         cc.start_at,
         cc.end_at,
         cc.fetched_at,
         cc.energy_fetched_at,
         EXISTS(
           SELECT 1 FROM chain_hits ch WHERE ch.torn_chain_id = cc.torn_chain_id
         ) AS hits_saved
       FROM chain_cache cc
       WHERE cc.faction_id = ?
       ORDER BY cc.start_at DESC
       LIMIT 5`
    )
      .bind(factionId)
      .all();

    return jsonResponse({ chains: result.results || [] });
  } catch (err) {
    console.error('getChains error:', err);
    return errorResponse('Failed to fetch chains', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/leadership/chains/archive?faction_id=XXXXX
// Full list of chains that already have saved member-hit data (chain_hits),
// no LIMIT — used to populate the "browse other saved chains" dropdown below
// the most-recent-5 view. Unlike getChains, unsaved cached chains (≥1,000
// hits but never opened/saved) are excluded — only real saved history.
// ─────────────────────────────────────────────────────────────────────────────
export async function getChainsArchive(request, env) {
  try {
    const url       = new URL(request.url);
    const factionId = parseInt(url.searchParams.get('faction_id'), 10);

    if (!factionId || !FACTION_IDS.includes(factionId)) {
      return errorResponse('Invalid or missing faction_id. Valid values: 33097, 9728, 9171', 400);
    }

    const { results } = await env.DB.prepare(
      `SELECT cc.torn_chain_id, cc.faction_id, cc.chain_length, cc.respect, cc.start_at, cc.end_at, cc.energy_fetched_at
       FROM chain_cache cc
       WHERE cc.faction_id = ?
         AND EXISTS(SELECT 1 FROM chain_hits ch WHERE ch.torn_chain_id = cc.torn_chain_id)
       ORDER BY cc.start_at DESC`
    ).bind(factionId).all();

    return jsonResponse({ chains: results || [] });
  } catch (err) {
    console.error('getChainsArchive error:', err);
    return errorResponse('Failed to fetch chain archive', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/leadership/chains/:id/hits
// Returns the already-saved member-hit data for one chain, straight from
// chain_hits/chain_cache — no live Torn API call (that data was frozen when
// the chain was originally saved).
// ─────────────────────────────────────────────────────────────────────────────
export async function getSavedChainHits(request, env) {
  try {
    const match   = request.url.match(/\/chains\/(\d+)\/hits/);
    const chainId = match ? parseInt(match[1], 10) : null;
    if (!chainId) return errorResponse('Invalid chain ID', 400);

    const chain = await env.DB.prepare(
      `SELECT torn_chain_id, faction_id, chain_length, respect, start_at, end_at, energy_fetched_at FROM chain_cache WHERE torn_chain_id=?`
    ).bind(chainId).first();
    if (!chain) return errorResponse('Chain not found', 404);

    const { results: hits } = await env.DB.prepare(
      `SELECT torn_user_id, total_attacks, total_respect, bonus_hits, xanax_used, xanax_deposited, overdoses
       FROM chain_hits WHERE torn_chain_id=? ORDER BY total_attacks DESC`
    ).bind(chainId).all();

    const ids = (hits || []).map((h) => h.torn_user_id);
    const usernames = {};
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      const fm = await env.DB.prepare(
        `SELECT torn_user_id, username FROM faction_members WHERE torn_user_id IN (${placeholders})`
      ).bind(...ids).all();
      for (const row of fm.results || []) usernames[row.torn_user_id] = row.username;

      const missing = ids.filter((id) => !usernames[id]);
      if (missing.length > 0) {
        const missingPlaceholders = missing.map(() => '?').join(',');
        const us = await env.DB.prepare(
          `SELECT torn_user_id, username FROM users WHERE torn_user_id IN (${missingPlaceholders})`
        ).bind(...missing).all();
        for (const row of us.results || []) usernames[row.torn_user_id] = row.username;
      }
    }

    return jsonResponse({ chain, hits: hits || [], usernames });
  } catch (err) {
    console.error('getSavedChainHits error:', err);
    return errorResponse('Failed to fetch saved chain hits', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/leadership/chain-report?chain_id=XXXXXXXX
// Proxies the Torn API chainreport and enriches attacker IDs with site usernames.
// ─────────────────────────────────────────────────────────────────────────────
export async function getChainReport(request, env) {
  try {
    const url     = new URL(request.url);
    const chainId = parseInt(url.searchParams.get('chain_id'), 10);

    if (!chainId) {
      return errorResponse('Missing chain_id', 400);
    }

    const apiKeyObj = await getRandomUserApiKey(env);
    if (!apiKeyObj?.key) {
      return errorResponse('No API key available — please ensure a user has a valid key stored', 503);
    }

    let data;
    try {
      data = await fetchWithRetry(
        `${TORN_API_BASE}/faction/${chainId}/chainreport?comment=OccHub`,
        { Authorization: `ApiKey ${apiKeyObj.key}` }
      );
    } catch (err) {
      return errorResponse(`Torn API error: ${err.message}`, 502);
    }

    // Collect all IDs that need a name: attackers + bonus hit attackers + non-attackers
    const attackers    = data.chainreport?.attackers     || [];
    const bonuses      = data.chainreport?.bonuses       || [];
    const nonAttackers = data.chainreport?.non_attackers || [];

    const allIds = [
      ...new Set([
        ...attackers.map((a) => a.id),
        ...bonuses.map((b) => b.attacker_id),
        ...nonAttackers,
      ].filter(Boolean)),
    ];

    const usernames = {};

    if (allIds.length > 0) {
      const placeholders = allIds.map(() => '?').join(',');

      // Primary lookup: faction_members (all current + past faction members)
      const fmResult = await env.DB.prepare(
        `SELECT torn_user_id, username FROM faction_members WHERE torn_user_id IN (${placeholders})`
      ).bind(...allIds).all();

      for (const row of fmResult.results || []) {
        usernames[row.torn_user_id] = row.username;
      }

      // Fallback: users table for anyone not in faction_members
      const missing = allIds.filter((id) => !usernames[id]);
      if (missing.length > 0) {
        const missingPlaceholders = missing.map(() => '?').join(',');
        const usersResult = await env.DB.prepare(
          `SELECT torn_user_id, username FROM users WHERE torn_user_id IN (${missingPlaceholders})`
        ).bind(...missing).all();

        for (const row of usersResult.results || []) {
          usernames[row.torn_user_id] = row.username;
        }
      }
    }

    return jsonResponse({ chainreport: data.chainreport, usernames });
  } catch (err) {
    console.error('getChainReport error:', err);
    return errorResponse('Failed to fetch chain report', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/leadership/chain-import
// Manually import a historical chain into chain_cache + chain_hits in one step.
// No minimum hit threshold — leaders decide which chains are worth importing.
// chain_cache: INSERT OR IGNORE (safe to re-run if already stored).
// chain_hits:  upsert (overwrites with fresh data if re-imported).
// ─────────────────────────────────────────────────────────────────────────────
export async function saveChainImport(request, env, user) {
  try {
    const body = await request.json();
    const { torn_chain_id, faction_id, chain_length, respect, start_at, end_at, attackers } = body;

    if (!torn_chain_id || !faction_id || !chain_length || !start_at || !end_at) {
      return errorResponse('Missing required chain fields: torn_chain_id, faction_id, chain_length, start_at, end_at', 400);
    }
    if (!ALLOWED_IMPORT_FACTION_IDS.includes(faction_id)) {
      return errorResponse(`faction_id ${faction_id} is not one of our tracked factions`, 400);
    }

    // Save chain metadata — no hit-count minimum for manual imports
    const cacheResult = await env.DB.prepare(
      `INSERT OR IGNORE INTO chain_cache
         (torn_chain_id, faction_id, chain_length, respect, start_at, end_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(torn_chain_id, faction_id, chain_length, respect ?? 0, start_at, end_at)
      .run();

    const chainAdded = (cacheResult.meta?.changes ?? 0) > 0;

    // Save member hits + add any unknown members to the member database
    let hitsSaved    = 0;
    let membersAdded = 0;

    for (const attacker of (attackers || [])) {
      if (!attacker.id || attacker.total_attacks < 1) continue;

      // Save hit record
      await env.DB.prepare(
        `INSERT INTO chain_hits
           (torn_chain_id, faction_id, torn_user_id, total_attacks, total_respect, bonus_hits, start_at, saved_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(torn_chain_id, torn_user_id) DO UPDATE SET
           total_attacks = excluded.total_attacks,
           total_respect = excluded.total_respect,
           bonus_hits    = excluded.bonus_hits,
           saved_by      = excluded.saved_by,
           saved_at      = CURRENT_TIMESTAMP`
      )
        .bind(
          torn_chain_id, faction_id, attacker.id,
          attacker.total_attacks,
          attacker.total_respect ?? 0,
          attacker.bonus_hits    ?? 0,
          start_at, user.userId
        )
        .run();

      hitsSaved++;

      // Add to faction_members if not already tracked and we have a username
      if (attacker.username) {
        const memberResult = await env.DB.prepare(
          `INSERT OR IGNORE INTO faction_members
             (torn_user_id, username, faction_id, is_active, joined_at, last_updated_at)
           VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
        )
          .bind(attacker.id, attacker.username, faction_id)
          .run();

        if ((memberResult.meta?.changes ?? 0) > 0) membersAdded++;
      }
    }

    const parts = [
      chainAdded
        ? `Chain #${torn_chain_id} added to history`
        : `Chain #${torn_chain_id} already in database`,
      `${hitsSaved} member hit record${hitsSaved !== 1 ? 's' : ''} saved`,
    ];
    if (membersAdded > 0) parts.push(`${membersAdded} new member${membersAdded !== 1 ? 's' : ''} added to member database`);

    const energyFetch = hitsSaved > 0 ? await triggerChainEnergyFetch(env, torn_chain_id) : { fetched: false, reason: 'no hits saved' };

    return jsonResponse({
      chainAdded,
      hitsSaved,
      membersAdded,
      energyFetch,
      message: parts.join(' — '),
    });
  } catch (err) {
    console.error('saveChainImport error:', err);
    return errorResponse('Failed to import chain', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/leadership/chain-hits
// Upserts per-member hit records for a chain.
// Body: { torn_chain_id, faction_id, start_at, attackers: [{id, total_attacks, total_respect, bonus_hits}] }
// ─────────────────────────────────────────────────────────────────────────────
export async function saveChainHits(request, env, user) {
  try {
    const body = await request.json();
    const { torn_chain_id, faction_id, start_at, attackers } = body;

    if (!torn_chain_id || !faction_id || !start_at || !Array.isArray(attackers) || attackers.length === 0) {
      return errorResponse('Missing required fields: torn_chain_id, faction_id, start_at, attackers[]', 400);
    }

    let saved = 0;

    for (const attacker of attackers) {
      if (!attacker.id || attacker.total_attacks < 1) continue;

      await env.DB.prepare(
        `INSERT INTO chain_hits
           (torn_chain_id, faction_id, torn_user_id, total_attacks, total_respect, bonus_hits, start_at, saved_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(torn_chain_id, torn_user_id) DO UPDATE SET
           total_attacks = excluded.total_attacks,
           total_respect = excluded.total_respect,
           bonus_hits    = excluded.bonus_hits,
           saved_by      = excluded.saved_by,
           saved_at      = CURRENT_TIMESTAMP`
      )
        .bind(
          torn_chain_id,
          faction_id,
          attacker.id,
          attacker.total_attacks,
          attacker.total_respect ?? 0,
          attacker.bonus_hits    ?? 0,
          start_at,
          user.userId
        )
        .run();

      saved++;
    }

    const energyFetch = saved > 0 ? await triggerChainEnergyFetch(env, torn_chain_id) : { fetched: false, reason: 'no hits saved' };

    return jsonResponse({
      saved,
      energyFetch,
      message: `${saved} member hit record${saved !== 1 ? 's' : ''} saved`,
    });
  } catch (err) {
    console.error('saveChainHits error:', err);
    return errorResponse('Failed to save chain hits', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/chains/status
// Per-faction chain count + last fetched_at for the admin cache panel.
// ─────────────────────────────────────────────────────────────────────────────
export async function getChainCacheStatus(request, env) {
  try {
    const result = await env.DB.prepare(
      `SELECT faction_id,
              COUNT(*)        AS total_chains,
              MAX(fetched_at) AS last_fetched
       FROM chain_cache
       GROUP BY faction_id`
    ).all();

    const status = {};
    for (const id of FACTION_IDS) {
      status[id] = { totalChains: 0, lastFetched: null };
    }
    for (const row of result.results || []) {
      status[row.faction_id] = {
        totalChains: row.total_chains,
        lastFetched: row.last_fetched,
      };
    }

    return jsonResponse({ status });
  } catch (err) {
    console.error('getChainCacheStatus error:', err);
    return errorResponse('Failed to fetch chain cache status', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/chains/refresh
// Admin-triggered force refresh of chain cache.
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/leadership/warnings/generate/chain?year=&month=1-12&factions=33097,9728,9171
// Source data for Warnings > Generate's Chain report: every saved chain each
// selected faction ran during the calendar month, with per-member attacks (for
// comparing against a per-faction target entered client-side, same pattern as
// the Energy generator) and an overdose count scoped to that SPECIFIC chain's
// own window — chain start minus a 3-day prep period, through chain end — not
// the whole month, since OD risk is tied to the chain itself, not the month at
// large. A faction with zero saved chains this month is reported as such
// (`no_chain: true`) rather than silently producing an empty/misleading member
// list, or worse, looking like every member missed a target that was never set.
export async function generateChainWarningReport(request, env) {
  try {
    const url   = new URL(request.url);
    const year  = parseInt(url.searchParams.get('year'), 10);
    const month = parseInt(url.searchParams.get('month'), 10);
    if (!year || !month || month < 1 || month > 12) {
      return errorResponse('year and month (1-12) are required', 400);
    }

    const factionsParam = url.searchParams.get('factions');
    const factions = (factionsParam ? factionsParam.split(',') : FACTION_IDS.map(String))
      .map(s => parseInt(s, 10))
      .filter(f => FACTION_IDS.includes(f));
    if (!factions.length) return errorResponse('At least one valid faction is required', 400);

    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    const monthStartTs = Math.floor(new Date(monthStart + 'T00:00:00Z').getTime() / 1000);
    const monthEndTs   = Math.floor(new Date(monthEnd   + 'T23:59:59Z').getTime() / 1000);

    const ph = factions.map(() => '?').join(',');
    const chainRows = await env.DB.prepare(`
      SELECT torn_chain_id, faction_id, chain_length, respect, start_at, end_at
      FROM chain_cache
      WHERE faction_id IN (${ph}) AND start_at >= ? AND start_at <= ?
      ORDER BY faction_id, start_at ASC
    `).bind(...factions, monthStartTs, monthEndTs).all();

    const chainsByFaction = {};
    for (const c of (chainRows.results || [])) (chainsByFaction[c.faction_id] ??= []).push(c);

    const noChainFactions = factions.filter(f => !chainsByFaction[f]);

    // Already-warned members for this month's Chain warnings — scoped by
    // month like warning_exclusions, NOT per specific chain, so a member
    // shows as already-warned on every chain card in this report once
    // they've been warned for ANY chain this month (same "Warn" flow posts
    // one member_warnings row per member per report run, not per chain).
    const warnedRows = await env.DB.prepare(`
      SELECT DISTINCT torn_user_id FROM member_warnings
      WHERE warning_type = 'Chain' AND period_year = ? AND period_month = ?
    `).bind(year, month).all();
    const warnedSet = new Set((warnedRows.results || []).map(r => r.torn_user_id));

    const chains = [];
    for (const factionId of factions) {
      for (const chain of (chainsByFaction[factionId] || [])) {
        const { results: hitRows } = await env.DB.prepare(`
          SELECT ch.torn_user_id, ch.total_attacks, ch.bonus_hits, ch.total_respect,
                 fm.username, fm.level, fm.is_active, fm.faction_id AS current_faction_id, fm.days_in_faction
          FROM chain_hits ch
          LEFT JOIN faction_members fm ON fm.torn_user_id = ch.torn_user_id
          WHERE ch.torn_chain_id = ?
        `).bind(chain.torn_chain_id).all();

        const activeHits = (hitRows || []).filter(h => h.is_active === 1);

        // OD window: chain's own start-3days through chain end — NOT the report
        // month — since overdose risk during a chain ties to the chain itself
        // (pre-chain xanax/drug prep + the chain's active window), not whatever
        // else happened that calendar month.
        const prepStart = new Date((chain.start_at - 3 * 86400) * 1000).toISOString().slice(0, 10);
        const chainEndDate = new Date(chain.end_at * 1000).toISOString().slice(0, 10);
        const chainStartDate = new Date(chain.start_at * 1000).toISOString().slice(0, 10);

        // Exemptions covering this chain: a Chain/All exemption exempts a
        // member only if the CHAIN'S OWN START DATE falls inside the
        // exemption's date range — not the chain's end, and not the report's
        // month. A member exempt the 20th–25th is covered by a chain that
        // started the 24th even though it ran until the 28th (the start is
        // what crossed into the exemption window), but NOT by a chain that
        // started the 28th (nothing about that chain touches the 20th–25th).
        const exemptionRows = await env.DB.prepare(`
          SELECT torn_user_id, exemption_type, date_start, date_end, reason
          FROM member_exemptions
          WHERE exemption_type IN ('Chain', 'All') AND date_start <= ? AND date_end >= ?
        `).bind(chainStartDate, chainStartDate).all();
        const exemptionByUser = {};
        for (const r of (exemptionRows.results || [])) {
          exemptionByUser[r.torn_user_id] ??= { type: r.exemption_type, date_start: r.date_start, date_end: r.date_end, reason: r.reason };
        }

        // Zero-hit members: chain_hits only ever stores attackers with
        // total_attacks >= 1 (see saveChainHits/saveChainImport), so a member
        // who was in the faction for the whole chain but never attacked has
        // NO row there at all — indistinguishable from "wasn't in the faction".
        // personal_stats_snapshots is only ONE point-in-time reading per day
        // (whatever faction they were in when the daily cron ran), so a member
        // who joined the faction the same day the chain ran can get a snapshot
        // for that date despite having joined during/after the chain — a bare
        // "snapshot exists somewhere in the chain's date range" check produced
        // false positives for brand-new joiners. To 100% confirm membership
        // THROUGHOUT the chain, require an unbroken snapshot streak in this
        // faction for every single day from the day BEFORE the chain started
        // through the chain's end date — any gap (never joined yet, or a
        // day they weren't active) fails the check.
        const hitUserIds = new Set((hitRows || []).map(h => h.torn_user_id));
        const dayBeforeStart = new Date(new Date(chainStartDate + 'T00:00:00Z').getTime() - 86400000).toISOString().slice(0, 10);
        const requiredDays = Math.round(
          (new Date(chainEndDate + 'T00:00:00Z').getTime() - new Date(dayBeforeStart + 'T00:00:00Z').getTime()) / 86400000
        ) + 1;
        const { results: confirmedRows } = await env.DB.prepare(`
          SELECT p.torn_user_id, fm.username, fm.level, fm.is_active, fm.faction_id AS current_faction_id, fm.days_in_faction
          FROM personal_stats_snapshots p
          LEFT JOIN faction_members fm ON fm.torn_user_id = p.torn_user_id
          WHERE p.faction_id = ? AND p.snapshot_date >= ? AND p.snapshot_date <= ?
          GROUP BY p.torn_user_id
          HAVING COUNT(DISTINCT p.snapshot_date) = ?
        `).bind(factionId, dayBeforeStart, chainEndDate, requiredDays).all();

        const zeroHitMembers = (confirmedRows || [])
          .filter(r => !hitUserIds.has(r.torn_user_id) && r.is_active === 1);

        const overdoses = {};
        const odUserIds = [...activeHits.map(h => h.torn_user_id), ...zeroHitMembers.map(r => r.torn_user_id)];
        if (odUserIds.length) {
          const ids = odUserIds;
          const idPh = ids.map(() => '?').join(',');
          const [odStartRows, odEndRows] = await Promise.all([
            env.DB.prepare(`
              SELECT p.torn_user_id, CAST(json_extract(p.stats, '$.drugs.overdoses') AS INTEGER) AS val
              FROM personal_stats_snapshots p
              INNER JOIN (
                SELECT torn_user_id, MIN(snapshot_date) AS min_date
                FROM personal_stats_snapshots
                WHERE torn_user_id IN (${idPh}) AND snapshot_date >= ? AND snapshot_date <= ?
                GROUP BY torn_user_id
              ) s ON p.torn_user_id = s.torn_user_id AND p.snapshot_date = s.min_date
            `).bind(...ids, prepStart, chainEndDate).all(),
            env.DB.prepare(`
              SELECT p.torn_user_id, CAST(json_extract(p.stats, '$.drugs.overdoses') AS INTEGER) AS val
              FROM personal_stats_snapshots p
              INNER JOIN (
                SELECT torn_user_id, MAX(snapshot_date) AS max_date
                FROM personal_stats_snapshots
                WHERE torn_user_id IN (${idPh}) AND snapshot_date >= ? AND snapshot_date <= ?
                GROUP BY torn_user_id
              ) e ON p.torn_user_id = e.torn_user_id AND p.snapshot_date = e.max_date
            `).bind(...ids, prepStart, chainEndDate).all(),
          ]);
          const odStart = {};
          for (const r of (odStartRows.results || [])) odStart[r.torn_user_id] = r.val ?? 0;
          for (const r of (odEndRows.results || [])) overdoses[r.torn_user_id] = Math.max(0, (r.val ?? 0) - (odStart[r.torn_user_id] ?? 0));
        }

        // Recruit-at-chain-time exclusion: we don't store faction_position or
        // days_in_faction historically (both are single current values on
        // faction_members, overwritten every sync) — so instead of a direct
        // "were they Recruit that day" check, back-derive an ESTIMATE of their
        // tenure at chain start from today's live days_in_faction, walked
        // backward by however many days have passed since the chain (same
        // "estimate a past date from a live running counter" approach already
        // used for join-date estimation in progressionController.js). Assumes
        // continuous membership since the chain — a member who left and
        // rejoined since then would look more tenured than they actually were
        // at the time, which only makes this UNDER-exclude, never falsely
        // flag someone as too-new. Under 3 estimated days: excluded outright
        // (recruit-equivalent, too new to be a fair warning candidate). Under
        // 10: kept as a normal candidate, but flagged `just_joined` so it's
        // visibly a recent joiner rather than a silent explanation-free flag.
        const daysSinceChainStart = Math.round(
          (Date.now() - new Date(chainStartDate + 'T00:00:00Z').getTime()) / 86400000
        );
        function estimatedDaysInFactionAtChainStart(daysInFactionNow) {
          if (daysInFactionNow == null) return null;
          return daysInFactionNow - daysSinceChainStart;
        }

        const members = [
          ...activeHits.map(h => ({
            torn_user_id:  h.torn_user_id,
            username:      h.username,
            faction_id:    h.current_faction_id ?? null,
            level:         h.level ?? null,
            total_attacks: h.total_attacks || 0,
            bonus_hits:    h.bonus_hits || 0,
            overdoses:     overdoses[h.torn_user_id] ?? 0,
            exemption:     exemptionByUser[h.torn_user_id] ?? null,
            already_warned: warnedSet.has(h.torn_user_id),
            _estDays:      estimatedDaysInFactionAtChainStart(h.days_in_faction),
          })),
          ...zeroHitMembers.map(r => ({
            torn_user_id:  r.torn_user_id,
            username:      r.username,
            faction_id:    r.current_faction_id ?? null,
            level:         r.level ?? null,
            total_attacks: 0,
            bonus_hits:    0,
            overdoses:     overdoses[r.torn_user_id] ?? 0,
            exemption:     exemptionByUser[r.torn_user_id] ?? null,
            no_hits_recorded: true,
            already_warned: warnedSet.has(r.torn_user_id),
            _estDays:      estimatedDaysInFactionAtChainStart(r.days_in_faction),
          })),
        ]
          .filter(m => m._estDays == null || m._estDays >= 3)
          .map(({ _estDays, ...m }) => ({ ...m, just_joined: _estDays != null && _estDays < 10 }))
          .sort((a, b) => b.total_attacks - a.total_attacks);

        chains.push({
          faction_id: factionId,
          torn_chain_id: chain.torn_chain_id,
          chain_length: chain.chain_length,
          respect: chain.respect,
          start_at: chain.start_at,
          end_at: chain.end_at,
          prep_start_date: prepStart,
          members,
        });
      }
    }

    return jsonResponse({
      year, month,
      month_start: monthStart, month_end: monthEnd,
      factions,
      no_chain_factions: noChainFactions,
      chains,
    });
  } catch (err) {
    console.error('generateChainWarningReport error:', err);
    return errorResponse('Failed to generate chain warning report', 500);
  }
}

export async function refreshChainsAdmin(request, env, user) {
  try {
    await logInfo(env, { category: 'admin', event: 'chain_cache_manual_start', message: `Manual chain cache refresh triggered by ${user?.username ?? 'unknown'}`, torn_user_id: user?.tornUserId, username: user?.username });
    const result = await fetchAndCacheChains(env, 'manual');

    const parts = [`${result.added} new chain${result.added !== 1 ? 's' : ''} added`];
    if (result.skipped > 0) parts.push(`${result.skipped} below ${MIN_CHAIN_LENGTH} hits skipped`);

    return jsonResponse({
      message: `Chain cache refreshed — ${parts.join(', ')}`,
      added:       result.added,
      skipped:     result.skipped,
      errors:      result.errors,
      refreshedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('refreshChainsAdmin error:', err);
    return errorResponse('Failed to refresh chain cache', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/leadership/chains/:id/energy
// Re-runs the armory/energy check for a single chain — used for a manual
// retry if the automatic on-save fetch failed (e.g. no API key available at
// that moment). Force-runs regardless of energy_fetched_at.
// ─────────────────────────────────────────────────────────────────────────────
export async function refetchChainEnergy(request, env, user) {
  try {
    const match   = request.url.match(/\/chains\/(\d+)\/energy/);
    const chainId = match ? parseInt(match[1], 10) : null;
    if (!chainId) return errorResponse('Invalid chain ID', 400);

    const chain = await env.DB.prepare(
      `SELECT torn_chain_id, faction_id, start_at, end_at FROM chain_cache WHERE torn_chain_id=?`
    ).bind(chainId).first();
    if (!chain) return errorResponse('Chain not found', 404);

    const apiKeyObj = await getStaffApiKeyForFaction(env, chain.faction_id);
    if (!apiKeyObj?.key) return errorResponse('No API key available for this faction — please ensure a staff member has a valid key stored', 503);

    const result = await fetchChainEnergyData(env, chain, apiKeyObj.key);

    await logInfo(env, {
      category: 'admin', event: 'chain_energy_refetch',
      message: `Chain ${chainId} energy re-fetched by ${user?.username ?? 'unknown'}: ${result.updated} member rows updated`,
      torn_user_id: user?.tornUserId, username: user?.username,
      meta: { chainId, updated: result.updated },
    });

    return jsonResponse({ updated: result.updated, message: `${result.updated} member row${result.updated !== 1 ? 's' : ''} updated` });
  } catch (err) {
    console.error('refetchChainEnergy error:', err);
    return errorResponse('Failed to fetch chain energy data', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/leadership/chains/energy-backfill
// One-time button: runs the armory/energy check (see fetchChainEnergyData)
// for every already-saved chain (chain_hits exists) that hasn't had it run
// yet — i.e. chains saved before this feature existed. Safe to re-run; only
// touches chains where energy_fetched_at IS NULL.
// ─────────────────────────────────────────────────────────────────────────────
export async function backfillChainEnergy(request, env, user) {
  try {
    const { results: chains } = await env.DB.prepare(
      `SELECT cc.torn_chain_id, cc.faction_id, cc.start_at, cc.end_at
       FROM chain_cache cc
       WHERE cc.energy_fetched_at IS NULL
         AND EXISTS(SELECT 1 FROM chain_hits ch WHERE ch.torn_chain_id = cc.torn_chain_id)
       ORDER BY cc.start_at DESC`
    ).all();

    let processed = 0;
    let updatedMembers = 0;
    const errors = [];
    // Cached per faction_id within this run — chains group by faction, no
    // need to re-query the same faction's staff key for every chain.
    const keyByFaction = {};

    for (const chain of (chains || [])) {
      try {
        // Must be a key belonging to THIS chain's faction — faction/news
        // always returns the calling key's own faction (previously used one
        // getRandomUserApiKey for the whole run, which could silently scope
        // every fetch to the wrong faction for chains belonging to the other
        // two factions).
        if (!(chain.faction_id in keyByFaction)) {
          const apiKeyObj = await getStaffApiKeyForFaction(env, chain.faction_id);
          keyByFaction[chain.faction_id] = apiKeyObj?.key ?? null;
        }
        const apiKey = keyByFaction[chain.faction_id];
        if (!apiKey) {
          errors.push(`Chain #${chain.torn_chain_id}: no API key available for faction ${chain.faction_id}`);
          continue;
        }

        const result = await fetchChainEnergyData(env, chain, apiKey);
        processed++;
        updatedMembers += result.updated;
      } catch (e) {
        console.error(`backfillChainEnergy: chain ${chain.torn_chain_id} failed:`, e.message);
        errors.push(`Chain #${chain.torn_chain_id}: ${e.message}`);
      }
    }

    await logInfo(env, {
      category: 'admin', event: 'chain_energy_backfill',
      message: `Chain energy backfill by ${user?.username ?? 'unknown'}: ${processed}/${(chains || []).length} chains, ${updatedMembers} member rows updated`,
      torn_user_id: user?.tornUserId, username: user?.username,
      meta: { processed, total: (chains || []).length, updatedMembers, errors },
    });

    return jsonResponse({
      processed,
      total: (chains || []).length,
      updatedMembers,
      errors,
      message: `${processed}/${(chains || []).length} chain${(chains || []).length !== 1 ? 's' : ''} processed — ${updatedMembers} member row${updatedMembers !== 1 ? 's' : ''} updated`,
    });
  } catch (err) {
    console.error('backfillChainEnergy error:', err);
    return errorResponse('Failed to backfill chain energy data', 500);
  }
}
