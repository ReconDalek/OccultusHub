import { logInfo, logError } from './logger.js';

const TORN_API_BASE = 'https://api.torn.com/v2';
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

function authHeader(key) {
  return { Authorization: `ApiKey ${key}` };
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// All Torn API calls go through here. Headers must include Authorization.
async function fetchWithRetry(url, headers = {}, maxRetries = MAX_RETRIES) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const data = await response.json();
      if (data.error) throw new Error(`Torn API error: ${data.error.error}`);
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) await delay(RETRY_DELAY * Math.pow(2, attempt));
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

// Fetches faction data for all factions using a faction-specific API key per faction.
export async function fetchAndCacheFactions(env, factionIds, _ignoredKey, trigger = 'cron') {
  let fetched = 0;
  let errors = 0;

  for (const factionId of factionIds) {
    const apiKeyObj = await getRandomApiKeyForFaction(env, factionId);
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
