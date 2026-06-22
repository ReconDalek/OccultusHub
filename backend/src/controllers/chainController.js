import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { getRandomUserApiKey, fetchWithRetry } from '../services/tornApiService.js';
import { logInfo, logWarn, logError } from '../services/logger.js';

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

    // Collect all IDs that need a name: attackers + bonus hit attackers
    const attackers  = data.chainreport?.attackers || [];
    const bonuses    = data.chainreport?.bonuses   || [];

    const allIds = [
      ...new Set([
        ...attackers.map((a) => a.id),
        ...bonuses.map((b) => b.attacker_id),
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

    return jsonResponse({
      chainAdded,
      hitsSaved,
      membersAdded,
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

    return jsonResponse({
      saved,
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
