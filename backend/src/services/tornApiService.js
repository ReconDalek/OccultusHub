const TORN_API_URL = 'https://api.torn.com';
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, maxRetries = MAX_RETRIES) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(`Torn API error: ${data.error.error}`);
      }

      return data;
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        const waitTime = RETRY_DELAY * Math.pow(2, attempt);
        await delay(waitTime);
      }
    }
  }

  throw lastError;
}

export async function getRandomUserApiKey(env) {
  try {
    const result = await env.DB.prepare(
      `SELECT api_key FROM users WHERE api_key IS NOT NULL ORDER BY RANDOM() LIMIT 1`
    ).first();

    if (!result?.api_key) return null;

    // Decrypt API key (decode from base64)
    try {
      const apiKey = atob(result.api_key);
      return apiKey;
    } catch {
      console.error('Failed to decrypt API key');
      return null;
    }
  } catch (error) {
    console.error('Error getting random user API key:', error);
    return null;
  }
}

export async function fetchAndCacheFactions(env, factionIds, apiKey) {
  if (!apiKey) {
    console.error('No API key available for faction fetch');
    return { fetched: 0, errors: 1 };
  }

  let fetched = 0;
  let errors = 0;

  for (const factionId of factionIds) {
    try {
      const url = `${TORN_API_URL}/faction/?id=${factionId}&selections=basic,members&key=${apiKey}`;
      const data = await fetchWithRetry(url);

      await env.DB.prepare(
        `INSERT INTO faction_cache (faction_id, data, fetched_at, error)
         VALUES (?, ?, CURRENT_TIMESTAMP, NULL)
         ON CONFLICT(faction_id) DO UPDATE SET
           data = excluded.data,
           fetched_at = CURRENT_TIMESTAMP,
           error = NULL`
      ).bind(factionId, JSON.stringify(data)).run();

      fetched++;
      console.log(`✓ Cached faction ${factionId}`);
    } catch (error) {
      errors++;
      console.error(`✗ Failed to fetch faction ${factionId}:`, error.message);

      await env.DB.prepare(
        `INSERT INTO faction_cache (faction_id, data, error)
         VALUES (?, '{}', ?)
         ON CONFLICT(faction_id) DO UPDATE SET
           error = excluded.error,
           fetched_at = CURRENT_TIMESTAMP`
      ).bind(factionId, error.message).run();
    }
  }

  return { fetched, errors };
}

export async function fetchAndCacheCompanies(env, companyIds, apiKey) {
  if (!apiKey) {
    console.error('No API key available for company fetch');
    return { fetched: 0, errors: 1 };
  }

  let fetched = 0;
  let errors = 0;

  for (const companyId of companyIds) {
    try {
      const url = `${TORN_API_URL}/company/?id=${companyId}&selections=profile,employees&key=${apiKey}`;
      const data = await fetchWithRetry(url);

      const normalized = {
        profile: {
          id: data.company?.ID,
          name: data.company?.name,
          type: { name: data.company?.company_type },
          rating: data.company?.rating,
          director: {
            id: data.company?.director_id,
            name: data.company?.director_name,
          },
          employees: {
            hired: data.company?.employees_hired,
            capacity: data.company?.employees_capacity,
          },
          income: {
            daily: data.company?.daily_income,
            weekly: data.company?.weekly_revenue,
          },
        },
        employees: Object.entries(data.company_employees || {}).map(([id, emp]) => ({
          id: parseInt(id),
          name: emp.name,
          position: { name: emp.position },
          last_action: emp.last_action,
        })),
      };

      await env.DB.prepare(
        `INSERT INTO company_cache (company_id, data, fetched_at, error)
         VALUES (?, ?, CURRENT_TIMESTAMP, NULL)
         ON CONFLICT(company_id) DO UPDATE SET
           data = excluded.data,
           fetched_at = CURRENT_TIMESTAMP,
           error = NULL`
      ).bind(companyId, JSON.stringify(normalized)).run();

      fetched++;
      console.log(`✓ Cached company ${companyId}`);
    } catch (error) {
      errors++;
      console.error(`✗ Failed to fetch company ${companyId}:`, error.message);

      await env.DB.prepare(
        `INSERT INTO company_cache (company_id, data, error)
         VALUES (?, '{}', ?)
         ON CONFLICT(company_id) DO UPDATE SET
           error = excluded.error,
           fetched_at = CURRENT_TIMESTAMP`
      ).bind(companyId, error.message).run();
    }
  }

  return { fetched, errors };
}
