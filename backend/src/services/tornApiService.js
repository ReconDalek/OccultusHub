import { logInfo, logError } from './logger.js';

const TORN_API_BASE = 'https://api.torn.com/v2';
const MAX_RETRIES   = 3;
const BASE_DELAY_MS = 2000;

function authHeader(key) {
  return { Authorization: `ApiKey ${key}` };
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Torn error text for a problem with the key itself (as opposed to the
// request) — retrying the SAME key can never fix these, but a DIFFERENT key
// from the pool might, so these are only retryable when the caller gave us
// a way to fetch one (see fetchWithRetry's getFreshKey param). Matched
// against Torn's actual "error" text, lowercased.
const KEY_ERROR_PATTERNS = [
  'key is empty',                                  // code 2
  'incorrect key',                                  // code 3
  'key owner is in federal jail',                   // code 10
  'key is temporarily disabled due to owner inactivity', // code 13
  'daily read limit reached',                       // code 14 — per-key cap, another key isn't capped
  'access level of this key is not high enough',    // code 16
  'api key paused by owner',                        // code 18
  'too many requests',                              // per-key rate limit (200 response, not HTTP 429)
];

function isKeyError(error) {
  const msg = error.message.toLowerCase();
  return msg.startsWith('torn api error:') && KEY_ERROR_PATTERNS.some((p) => msg.includes(p));
}

// Returns true for errors worth retrying. Network failures, 5xx and 429 are
// always retryable. Other Torn application errors (e.g. "Incorrect
// ID-entity relation") never are — no key or wait fixes a logically wrong
// request. A key-specific error (bad/dead key) is retryable ONLY when a
// getFreshKey function was supplied, since that's what makes "try a
// different key" possible instead of hammering the same dead one.
function isRetryable(error, canSwapKey) {
  if (canSwapKey && isKeyError(error)) return true;
  const msg = error.message;
  if (msg.startsWith('Torn API error:')) return false; // application-level error
  if (/^HTTP 4/.test(msg) && !msg.startsWith('HTTP 429')) return false; // 4xx except rate-limit
  return true; // network error, 5xx, 429
}

// Shared retry wrapper used by all Torn API callers. Returns parsed JSON on
// success, throws on final failure.
//
// `authOrGetKey` is either:
//   - a fixed headers object (e.g. { Authorization: 'ApiKey ...' }) — no
//     key-swapping; every attempt reuses the same key, matching the
//     original behaviour, for call sites that already resolved one specific
//     key for a reason (e.g. want to log exactly which key was used without
//     extra bookkeeping).
//   - an async function returning a fresh { key, tornUserId, username }
//     object — called again before EVERY attempt, including retries, so a
//     transient failure also gets a new key (not just a wait), and a
//     bad/dead key gets swapped out instead of failing outright. Capture
//     the returned object in a closure variable if the caller needs to know
//     afterward which key actually succeeded (for logging).
export async function fetchWithRetry(url, authOrGetKey = {}, maxRetries = MAX_RETRIES) {
  const getFreshKey = typeof authOrGetKey === 'function' ? authOrGetKey : null;
  let headers = getFreshKey ? null : authOrGetKey;

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (getFreshKey) {
      const keyObj = await getFreshKey();
      if (!keyObj?.key) throw new Error('No API key available');
      headers = authHeader(keyObj.key);
    }
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      if (data.error) {
        throw new Error(`Torn API error: ${data.error.error || JSON.stringify(data.error)}`);
      }
      return data;
    } catch (error) {
      if (!isRetryable(error, !!getFreshKey)) throw error; // fast-fail non-transient errors
      lastError = error;
      if (attempt < maxRetries) {
        // A bad/rate-limited key's fix is the swap itself, not a wait — the
        // next attempt already uses a different key, so retry immediately.
        const swappingBadKey = getFreshKey && isKeyError(error);
        const waitMs = swappingBadKey
          ? 0
          : error.message.startsWith('HTTP 429')
            ? 15000  // rate-limited: wait 15s
            : BASE_DELAY_MS * Math.pow(2, attempt); // 2s, 4s, 8s
        console.warn(`[fetchWithRetry] attempt ${attempt + 1}/${maxRetries + 1} failed (${error.message}) — retrying${waitMs ? ` in ${waitMs}ms` : ''}${getFreshKey ? ' with a different key' : ''}`);
        if (waitMs) await delay(waitMs);
      }
    }
  }
  throw lastError;
}

// Returns { key, tornUserId, username } or null. Key value is never logged.
export async function getRandomApiKeyForFaction(env, factionId) {
  try {
    const result = await env.DB.prepare(
      `SELECT api_key, torn_user_id, username FROM users WHERE api_key IS NOT NULL AND faction_id = ? ORDER BY RANDOM() LIMIT 1`
    ).bind(factionId).first();
    if (!result?.api_key) return null;
    try { return { key: atob(result.api_key), tornUserId: result.torn_user_id, username: result.username }; }
    catch { return null; }
  } catch (e) {
    console.error('Error getting faction API key:', e);
    return null;
  }
}

// Returns every leadership member's key for the faction (not just one), shuffled —
// for bulk pagination that needs to round-robin across keys. Torn rate-limits
// per API key, so hundreds of rapid sequential calls on a single key trip
// "Too many requests" long before a real per-faction ceiling is reached.
export async function getStaffApiKeysForFaction(env, factionId) {
  const positions = factionId === 9728
    ? `('Leader','Co-leader')`
    : `('Leader','Co-leader','Council','Archon')`;
  try {
    const { results } = await env.DB.prepare(
      `SELECT api_key, torn_user_id, username FROM users
       WHERE api_key IS NOT NULL AND faction_id = ? AND faction_position IN ${positions}`
    ).bind(factionId).all();
    const keys = [];
    for (const r of (results || [])) {
      try { keys.push({ key: atob(r.api_key), tornUserId: r.torn_user_id, username: r.username }); }
      catch { /* undecodable key — skip */ }
    }
    for (let i = keys.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [keys[i], keys[j]] = [keys[j], keys[i]];
    }
    return keys;
  } catch (e) {
    console.error('Error getting staff API keys:', e);
    return [];
  }
}

// Returns { key, tornUserId, username } or null.
// Only selects leadership ranks. Faction 9728 is temporarily restricted to Leader/Co-leader only
// until Archon/Council permissions are granted in Torn.
export async function getStaffApiKeyForFaction(env, factionId) {
  // Temporary: 9728 only has armory API access for Leader/Co-leader
  const positions = factionId === 9728
    ? `('Leader','Co-leader')`
    : `('Leader','Co-leader','Council','Archon')`;
  try {
    const result = await env.DB.prepare(
      `SELECT api_key, torn_user_id, username FROM users
       WHERE api_key IS NOT NULL AND faction_id = ? AND faction_position IN ${positions}
       ORDER BY RANDOM()
       LIMIT 1`
    ).bind(factionId).first();
    if (!result?.api_key) return null;
    try { return { key: atob(result.api_key), tornUserId: result.torn_user_id, username: result.username }; }
    catch { return null; }
  } catch (e) {
    console.error('Error getting staff API key:', e);
    return null;
  }
}

// Returns { key, tornUserId, username } or null.
export async function getRandomUserApiKey(env) {
  try {
    const result = await env.DB.prepare(
      `SELECT api_key, torn_user_id, username FROM users WHERE api_key IS NOT NULL ORDER BY RANDOM() LIMIT 1`
    ).first();
    if (!result?.api_key) return null;
    try { return { key: atob(result.api_key), tornUserId: result.torn_user_id, username: result.username }; }
    catch { console.error('Failed to decrypt API key'); return null; }
  } catch (e) {
    console.error('Error getting random user API key:', e);
    return null;
  }
}

// Fetches a Torn account's age in days at the moment this is called (profile.age).
// Public endpoint — no faction-specific permission needed, so any stored key works,
// not just a staff/leadership one. Used by the mentoring feature at add-time to
// auto-detect a mentee's current account age instead of manual entry. Returns null
// on any failure (no key available, API error) — callers should treat that as
// "unknown, needs manual entry," not "age is zero."
export async function fetchTornAccountAge(env, tornUserId) {
  let usedKeyObj = null;
  const getFreshKey = async () => { usedKeyObj = await getRandomUserApiKey(env); return usedKeyObj; };

  const probe = await getFreshKey();
  if (!probe?.key) {
    await logError(env, { category: 'api_error', event: 'mentoring_age_fetch_no_key', message: 'No API key available for mentee age lookup', meta: { targetTornUserId: tornUserId } });
    return null;
  }
  const url = `${TORN_API_BASE}/user/${tornUserId}/profile?striptags=true&comment=OccHub`;
  try {
    const data = await fetchWithRetry(url, getFreshKey);
    const age = data?.profile?.age;
    if (typeof age !== 'number') {
      await logError(env, { category: 'api_error', event: 'mentoring_age_fetch_bad_shape', message: 'Torn profile response had no numeric age field', torn_user_id: usedKeyObj?.tornUserId, username: usedKeyObj?.username, meta: { targetTornUserId: tornUserId, endpoint: url } });
      return null;
    }
    await logInfo(env, {
      category: 'api_call', event: 'mentoring_age_fetch_success',
      message: `Fetched account age for mentee ${tornUserId}: ${age} days`,
      torn_user_id: usedKeyObj?.tornUserId, username: usedKeyObj?.username,
      meta: { targetTornUserId: tornUserId, age, endpoint: url },
    });
    return age;
  } catch (error) {
    await logError(env, {
      category: 'api_error', event: 'mentoring_age_fetch_failed',
      message: `Failed to fetch account age for mentee ${tornUserId}: ${error.message}`,
      torn_user_id: usedKeyObj?.tornUserId, username: usedKeyObj?.username,
      meta: { targetTornUserId: tornUserId, endpoint: url, error: error.message },
    });
    return null;
  }
}

// Fetches faction data for all factions using a faction-specific API key per faction.
export async function fetchAndCacheFactions(env, factionIds, _ignoredKey, trigger = 'cron') {
  let fetched = 0;
  let errors = 0;

  for (const factionId of factionIds) {
    let usedKeyObj = null;
    const getFreshKey = async () => { usedKeyObj = await getStaffApiKeyForFaction(env, factionId); return usedKeyObj; };

    const probe = await getFreshKey();
    if (!probe?.key) {
      await logError(env, { category: 'api_error', event: 'faction_cache_no_key', message: `No API key available for faction ${factionId}`, faction_id: factionId, meta: { trigger } });
      await env.DB.prepare(
        `INSERT INTO faction_cache (faction_id, data, error) VALUES (?, '{}', ?)
         ON CONFLICT(faction_id) DO UPDATE SET error = excluded.error, fetched_at = CURRENT_TIMESTAMP`
      ).bind(factionId, 'No API key available').run();
      errors++;
      continue;
    }
    const url = `${TORN_API_BASE}/faction?selections=basic,members,balance,rackets&id=${factionId}&cat=all&comment=OccHub`;

    try {
      const data = await fetchWithRetry(url, getFreshKey);

      await env.DB.prepare(
        `INSERT INTO faction_cache (faction_id, data, fetched_at, error)
         VALUES (?, ?, CURRENT_TIMESTAMP, NULL)
         ON CONFLICT(faction_id) DO UPDATE SET data = excluded.data, fetched_at = CURRENT_TIMESTAMP, error = NULL`
      ).bind(factionId, JSON.stringify(data)).run();

      fetched++;
      console.log(`✓ Cached faction ${factionId}`);
      await logInfo(env, {
        category: 'api_call', event: 'faction_cache_success',
        message: `Faction ${factionId} cache refreshed`,
        torn_user_id: usedKeyObj?.tornUserId, username: usedKeyObj?.username, faction_id: factionId,
        meta: { trigger, endpoint: url },
      });
    } catch (error) {
      errors++;
      console.error(`✗ Failed to fetch faction ${factionId}:`, error.message);
      await logError(env, {
        category: 'api_error', event: 'faction_cache_failed',
        message: `Faction ${factionId} cache failed: ${error.message}`,
        torn_user_id: usedKeyObj?.tornUserId, username: usedKeyObj?.username, faction_id: factionId,
        meta: { trigger, endpoint: url, error: error.message },
      });
      await env.DB.prepare(
        `INSERT INTO faction_cache (faction_id, data, error) VALUES (?, '{}', ?)
         ON CONFLICT(faction_id) DO UPDATE SET error = excluded.error, fetched_at = CURRENT_TIMESTAMP`
      ).bind(factionId, error.message).run();
    }
  }

  return { fetched, errors };
}

export async function fetchAndCacheCompanies(env, companyIds, apiKeyObj, trigger = 'cron') {
  if (!apiKeyObj?.key) {
    await logError(env, { category: 'api_error', event: 'company_cache_no_key', message: 'No API key available for company cache refresh', meta: { trigger } });
    return { fetched: 0, errors: 1 };
  }

  let fetched = 0;
  let errors = 0;

  for (const companyId of companyIds) {
    // First attempt reuses the key the caller already resolved (so a single
    // caller-level call still mostly uses one key); any retry grabs a fresh
    // one from the general pool, swapping out a bad/dead key automatically.
    let usedKeyObj = apiKeyObj;
    let firstAttempt = true;
    const getFreshKey = async () => {
      if (firstAttempt) { firstAttempt = false; return usedKeyObj; }
      usedKeyObj = await getRandomUserApiKey(env);
      return usedKeyObj;
    };

    const url = `${TORN_API_BASE}/company?selections=profile,employees&id=${companyId}&comment=OccHub`;
    try {
      const data = await fetchWithRetry(url, getFreshKey);

      await env.DB.prepare(
        `INSERT INTO company_cache (company_id, data, fetched_at, error)
         VALUES (?, ?, CURRENT_TIMESTAMP, NULL)
         ON CONFLICT(company_id) DO UPDATE SET data = excluded.data, fetched_at = CURRENT_TIMESTAMP, error = NULL`
      ).bind(companyId, JSON.stringify(data)).run();

      fetched++;
      console.log(`✓ Cached company ${companyId}`);
      await logInfo(env, {
        category: 'api_call', event: 'company_cache_success',
        message: `Company ${companyId} cache refreshed`,
        torn_user_id: usedKeyObj?.tornUserId, username: usedKeyObj?.username,
        meta: { trigger, companyId, endpoint: url },
      });
    } catch (error) {
      errors++;
      console.error(`✗ Failed to fetch company ${companyId}:`, error.message);
      await logError(env, {
        category: 'api_error', event: 'company_cache_failed',
        message: `Company ${companyId} cache failed: ${error.message}`,
        torn_user_id: usedKeyObj?.tornUserId, username: usedKeyObj?.username,
        meta: { trigger, companyId, endpoint: url, error: error.message },
      });
      await env.DB.prepare(
        `INSERT INTO company_cache (company_id, data, error) VALUES (?, '{}', ?)
         ON CONFLICT(company_id) DO UPDATE SET error = excluded.error, fetched_at = CURRENT_TIMESTAMP`
      ).bind(companyId, error.message).run();
    }
  }

  return { fetched, errors };
}
