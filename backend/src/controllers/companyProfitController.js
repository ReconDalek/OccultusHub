import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { fetchWithRetry } from '../services/tornApiService.js';

const PRINCIPAL_PER_COMPANY = 4_000_000_000;
const FACTION_CUT_PCT = 0.30;

export async function fetchAndCacheCompanyProfits(env) {
  const results = { fetched: 0, skipped: 0, errors: [] };

  // Load all invested companies from company_config (canonical list)
  const { results: configRows } = await env.DB.prepare(
    `SELECT cc.company_id, cache.data
     FROM company_config cc
     LEFT JOIN company_cache cache ON cache.company_id = cc.company_id`
  ).all();

  if (!configRows.length) {
    console.log('[company-profit] no companies in config');
    return results;
  }

  // Build director_id → API key map from users table
  const { results: userRows } = await env.DB.prepare(
    `SELECT torn_user_id, api_key FROM users WHERE api_key IS NOT NULL AND api_key != ''`
  ).all();
  const keyMap = {};
  for (const u of userRows) {
    try { keyMap[u.torn_user_id] = atob(u.api_key); } catch { /* skip malformed */ }
  }

  const today = new Date().toISOString().slice(0, 10);

  for (const row of configRows) {
    let profile;
    try {
      profile = JSON.parse(row.data)?.profile;
    } catch { /* profile stays undefined */ }

    const directorId = profile?.director?.id;
    const directorName = profile?.director?.name ?? null;
    const companyName = profile?.name ?? `Company ${row.company_id}`;
    const apiKey = directorId ? keyMap[directorId] : null;

    // Look up director's faction from faction_members
    const memberRow = directorId ? await env.DB.prepare(
      `SELECT faction_id FROM faction_members WHERE torn_user_id = ? AND is_active = 1 LIMIT 1`
    ).bind(directorId).first() : null;
    const factionId = memberRow?.faction_id ?? null;

    if (!apiKey) {
      // No key — store/update principal-only row so it still counts in networth
      await env.DB.prepare(
        `INSERT INTO company_profit_cache
           (company_id, name, director_id, director_name, faction_id, principal, has_api_key, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
         ON CONFLICT(company_id) DO UPDATE SET
           name = excluded.name, director_id = excluded.director_id,
           director_name = excluded.director_name, faction_id = excluded.faction_id,
           principal = excluded.principal, has_api_key = 0, fetched_at = excluded.fetched_at
           -- principal_paid intentionally excluded: managed manually`
      ).bind(row.company_id, companyName, directorId ?? 0, directorName, factionId, PRINCIPAL_PER_COMPANY).run();

      console.log(`[company-profit] ${companyName} (${row.company_id}): no API key for director ${directorId}`);
      results.skipped++;
      continue;
    }

    try {
      const data = await fetchWithRetry(
        `https://api.torn.com/v2/company?selections=profile,employees&id=${row.company_id}&cat=main`,
        { Authorization: `ApiKey ${apiKey}` }
      );

      if (data?.error) throw new Error(`Torn API error ${data.error.code}: ${data.error.error}`);

      const p = data.profile;
      const employees = data.employees || [];

      const dailyIncome = p.income?.daily ?? 0;
      const dailyAdvert = p.advertisement_budget ?? 0;
      const dailyWages  = employees.reduce((s, e) => s + (e.wage ?? 0), 0);
      const dailyProfit = Math.max(0, dailyIncome - dailyWages - dailyAdvert);
      const factionCut  = Math.round(dailyProfit * FACTION_CUT_PCT);

      // Update profit cache with latest daily values (monthly projection now derived from snapshots)
      await env.DB.prepare(
        `INSERT INTO company_profit_cache
           (company_id, name, director_id, director_name, faction_id,
            daily_income, daily_wages, daily_advert, daily_profit,
            faction_cut, principal, has_api_key, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
         ON CONFLICT(company_id) DO UPDATE SET
           name = excluded.name, director_id = excluded.director_id,
           director_name = excluded.director_name, faction_id = excluded.faction_id,
           daily_income = excluded.daily_income, daily_wages = excluded.daily_wages,
           daily_advert = excluded.daily_advert, daily_profit = excluded.daily_profit,
           faction_cut = excluded.faction_cut,
           principal = excluded.principal, has_api_key = 1, fetched_at = excluded.fetched_at
           -- principal_paid intentionally excluded: managed manually`
      ).bind(
        row.company_id, p.name ?? companyName, p.director?.id ?? directorId,
        p.director?.name ?? directorName, factionId,
        dailyIncome, dailyWages, dailyAdvert, dailyProfit,
        factionCut, PRINCIPAL_PER_COMPANY
      ).run();

      // Insert daily snapshot (INSERT OR IGNORE so re-runs the same day are no-ops)
      await env.DB.prepare(
        `INSERT OR IGNORE INTO company_profit_snapshots
           (company_id, snapshot_date, daily_income, daily_wages, daily_advert, daily_profit, faction_cut)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(row.company_id, today, dailyIncome, dailyWages, dailyAdvert, dailyProfit, factionCut).run();

      // Also refresh company_cache with the richer director-key data
      await env.DB.prepare(
        `INSERT INTO company_cache (company_id, data, fetched_at, fetched_by_user, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(company_id) DO UPDATE SET
           data = excluded.data, fetched_at = excluded.fetched_at,
           fetched_by_user = excluded.fetched_by_user, updated_at = excluded.updated_at`
      ).bind(row.company_id, JSON.stringify(data), directorId).run();

      console.log(`[company-profit] ${p.name ?? companyName}: daily profit $${dailyProfit.toLocaleString()}, faction cut $${factionCut.toLocaleString()}/day`);
      results.fetched++;
    } catch (e) {
      console.error(`[company-profit] ${companyName} failed:`, e.message);
      results.errors.push({ company_id: row.company_id, name: companyName, error: e.message });
    }
  }

  console.log(`[company-profit] done — ${results.fetched} fetched, ${results.skipped} skipped (no key), ${results.errors.length} errors`);
  return results;
}

export async function getCompanyProfitStatus(request, env, user) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [cacheRow, snapshotRow] = await Promise.all([
      env.DB.prepare(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN has_api_key = 1 THEN 1 ELSE 0 END) as with_key,
                SUM(CASE WHEN principal_paid = 1 THEN 1 ELSE 0 END) as principal_paid_count,
                MAX(fetched_at) as fetched_at FROM company_profit_cache`
      ).first(),
      env.DB.prepare(
        `SELECT COUNT(*) as total_snapshots,
                COUNT(CASE WHEN snapshot_date = ? THEN 1 END) as snapshots_today,
                MIN(snapshot_date) as earliest,
                MAX(snapshot_date) as latest
         FROM company_profit_snapshots`
      ).bind(today).first(),
    ]);
    return jsonResponse({
      ...(cacheRow ?? { total: 0, with_key: 0, principal_paid_count: 0, fetched_at: null }),
      total_snapshots:  snapshotRow?.total_snapshots ?? 0,
      snapshots_today:  snapshotRow?.snapshots_today ?? 0,
      earliest_snapshot: snapshotRow?.earliest ?? null,
      latest_snapshot:   snapshotRow?.latest   ?? null,
    });
  } catch (e) {
    return errorResponse('Failed to fetch company profit status: ' + e.message, 500);
  }
}

export async function setPrincipalPaid(request, env, user) {
  try {
    const url = new URL(request.url);
    const companyId = parseInt(url.pathname.split('/').at(-2));
    const { paid } = await request.json();
    await env.DB.prepare(
      `UPDATE company_profit_cache SET principal_paid = ? WHERE company_id = ?`
    ).bind(paid ? 1 : 0, companyId).run();
    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to update principal paid: ' + e.message, 500);
  }
}

export async function addCompany(request, env, user) {
  try {
    const { company_id } = await request.json();
    if (!company_id) return errorResponse('company_id required', 400);
    const id = parseInt(company_id);

    // Add to config table (drives daily cron)
    await env.DB.prepare(
      `INSERT OR IGNORE INTO company_config (company_id, added_by) VALUES (?, ?)`
    ).bind(id, user.userId).run();

    // Seed a placeholder row in profit cache so it shows immediately
    await env.DB.prepare(
      `INSERT OR IGNORE INTO company_profit_cache
         (company_id, name, director_id, director_name, faction_id, principal, has_api_key, principal_paid)
       VALUES (?, ?, 0, NULL, NULL, ?, 0, 1)`
    ).bind(id, `Company ${id}`, PRINCIPAL_PER_COMPANY).run();

    // Trigger a company_cache fetch so the 12h cron picks up name/director
    const { fetchAndCacheCompanies, getRandomUserApiKey } = await import('../services/tornApiService.js');
    const apiKeyObj = await getRandomUserApiKey(env);
    if (apiKeyObj?.key) {
      fetchAndCacheCompanies(env, [id], apiKeyObj, 'manual').catch(e =>
        console.error('[add-company] cache fetch failed:', e)
      );
    }

    return jsonResponse({ success: true, company_id: id });
  } catch (e) {
    return errorResponse('Failed to add company: ' + e.message, 500);
  }
}

export async function refreshCompanyProfitCache(request, env, user) {
  try {
    const result = await fetchAndCacheCompanyProfits(env);
    return jsonResponse({
      message: `Company profits refreshed: ${result.fetched} fetched, ${result.skipped} skipped`,
      ...result,
      refreshedAt: new Date().toISOString(),
    });
  } catch (e) {
    return errorResponse('Company profit refresh failed: ' + e.message, 500);
  }
}

export async function getCompanyProfits(request, env, user) {
  try {
    const url = new URL(request.url);
    const factionId = url.searchParams.get('faction_id');

    const whereClause = factionId ? `WHERE c.faction_id = ${parseInt(factionId)}` : '';

    // Compute days in current month for estimated monthly projection
    const now = new Date();
    const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();

    const { results } = await env.DB.prepare(
      `SELECT
         c.*,
         COALESCE(s.mtd_profit, 0)        AS mtd_profit,
         COALESCE(s.ytd_profit, 0)        AS ytd_profit,
         COALESCE(s.prev_month_profit, 0) AS prev_month_profit,
         COALESCE(s.month_days, 0)        AS month_snapshot_days,
         COALESCE(s.avg_daily_profit, 0)  AS avg_daily_profit,
         COALESCE(s.avg_daily_cut, 0)     AS avg_daily_cut
       FROM company_profit_cache c
       LEFT JOIN (
         SELECT
           company_id,
           SUM(CASE WHEN snapshot_date >= date('now', 'start of month')
                     THEN daily_profit ELSE 0 END)                                                   AS mtd_profit,
           SUM(CASE WHEN snapshot_date >= date('now', 'start of year')
                     THEN daily_profit ELSE 0 END)                                                   AS ytd_profit,
           SUM(CASE WHEN snapshot_date >= date('now', 'start of month', '-1 month')
                     AND  snapshot_date <  date('now', 'start of month')
                     THEN daily_profit ELSE 0 END)                                                   AS prev_month_profit,
           COUNT(CASE WHEN snapshot_date >= date('now', 'start of month') THEN 1 END)               AS month_days,
           AVG(CASE WHEN snapshot_date >= date('now', 'start of month')
                     THEN CAST(daily_profit AS REAL) END)                                            AS avg_daily_profit,
           AVG(CASE WHEN snapshot_date >= date('now', 'start of month')
                     THEN CAST(faction_cut AS REAL) END)                                             AS avg_daily_cut
         FROM company_profit_snapshots
         GROUP BY company_id
       ) s ON s.company_id = c.company_id
       ${whereClause}
       ORDER BY c.daily_profit DESC`
    ).all();

    const companies = results.map(r => ({
      ...r,
      est_monthly: Math.round((r.avg_daily_profit ?? 0) * daysInMonth),
    }));

    return jsonResponse({ companies });
  } catch (e) {
    return errorResponse('Failed to fetch company profits: ' + e.message, 500);
  }
}
