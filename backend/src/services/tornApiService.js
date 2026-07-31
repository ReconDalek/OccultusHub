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

// Returns true for transient errors worth retrying (network failures, 5xx, 429).
// Torn API application errors (e.g. "Incorrect ID-entity relation") are not retryable.
function isRetryable(error) {
  const msg = error.message;
  if (msg.startsWith('Torn API error:')) return false; // application-level error
  if (/^HTTP 4/.test(msg) && !msg.startsWith('HTTP 429')) return false; // 4xx except rate-limit
  return true; // network error, 5xx, 429
}

// Shared retry wrapper used by all Torn API callers.
// Returns parsed JSON on success, throws on final failure.
export async function fetchWithRetry(url, headers = {}, maxRetries = MAX_RETRIES) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
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
      if (!isRetryable(error)) throw error; // fast-fail non-transient errors
      lastError = error;
      if (attempt < maxRetries) {
        const waitMs = error.message.startsWith('HTTP 429')
          ? 15000  // rate-limited: wait 15s
          : BASE_DELAY_MS * Math.pow(2, attempt); // 2s, 4s, 8s
        console.warn(`[fetchWithRetry] attempt ${attempt + 1}/${maxRetries + 1} failed (${error.message}) — retrying in ${waitMs}ms`);
        await delay(waitMs);
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

// Returns a Torn account's age in days (profile.age), or null on any failure —
// callers should treat null as "retry later", not "age is zero".
export async function fetchTornAccountAge(env, factionId, tornUserId) {
  const apiKeyObj = await getStaffApiKeyForFaction(env, factionId);
  if (!apiKeyObj?.key) return null;
  try {
    const data = await fetchWithRetry(
      `${TORN_API_BASE}/user/${tornUserId}?selections=profile&comment=OccHub`,
      authHeader(apiKeyObj.key)
    );
    const age = data?.profile?.age;
    return typeof age === 'number' ? age : null;
  } catch (e) {
    console.error(`fetchTornAccountAge failed for ${tornUserId}:`, e.message);
    return null;
  }
}

// Fetches faction data for all factions using a faction-specific API key per faction.
export async function fetchAndCacheFactions(env, factionIds, _ignoredKey, trigger = 'cron') {
  let fetched = 0;
  let errors = 0;

  for (const factionId of factionIds) {
    const apiKeyObj = await getStaffApiKeyForFaction(env, factionId);
    if (!apiKeyObj?.key) {
      await logError(env, { category: 'api_error', event: 'faction_cache_no_key', message: `No API key available for faction ${factionId}`, faction_id: factionId, meta: { trigger } });
      await env.DB.prepare(
        `INSERT INTO faction_cache (faction_id, data, error) VALUES (?, '{}', ?)
         ON CONFLICT(faction_id) DO UPDATE SET error = excluded.error, fetched_at = CURRENT_TIMESTAMP`
      ).bind(factionId, 'No API key available').run();
      errors++;
      continue;
    }
    const { key, tornUserId, username } = apiKeyObj;
    const url = `${TORN_API_BASE}/faction?selections=basic,members,balance,rackets&id=${factionId}&cat=all&comment=OccHub`;

    try {
      const data = await fetchWithRetry(url, authHeader(key));

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
        torn_user_id: tornUserId, username, faction_id: factionId,
        meta: { trigger, endpoint: url },
      });
    } catch (error) {
      errors++;
      console.error(`✗ Failed to fetch faction ${factionId}:`, error.message);
      await logError(env, {
        category: 'api_error', event: 'faction_cache_failed',
        message: `Faction ${factionId} cache failed: ${error.message}`,
        torn_user_id: tornUserId, username, faction_id: factionId,
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
  const { key, tornUserId, username } = apiKeyObj;

  let fetched = 0;
  let errors = 0;

  for (const companyId of companyIds) {
    const url = `${TORN_API_BASE}/company?selections=profile,employees&id=${companyId}&comment=OccHub`;
    try {
      const data = await fetchWithRetry(url, authHeader(key));

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
        torn_user_id: tornUserId, username,
        meta: { trigger, companyId, endpoint: url },
      });
    } catch (error) {
      errors++;
      console.error(`✗ Failed to fetch company ${companyId}:`, error.message);
      await logError(env, {
        category: 'api_error', event: 'company_cache_failed',
        message: `Company ${companyId} cache failed: ${error.message}`,
        torn_user_id: tornUserId, username,
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
