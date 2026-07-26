import { handleRequest } from './routes.js';
import { errorHandler } from './middleware/errorHandler.js';

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': env.CORS_ORIGIN,
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Credentials': 'true',
    };

    // Handle preflight before any route logic
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      const response = await handleRequest(request, env, ctx);
      const headers = new Headers(response.headers);
      for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v);

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      const errResponse = errorHandler(error);
      const headers = new Headers(errResponse.headers);
      for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v);
      return new Response(errResponse.body, { status: errResponse.status, headers });
    }
  },

  async scheduled(event, env, ctx) {
    // "0 1 * * *" — daily 01:00 UTC: energy snapshot + personal stats snapshot + company profit snapshot + TCI alerts + armory low stock
    if (event.cron === '0 1 * * *') {
      try {
        const { takeEnergySnapshot, takePersonalStatsSnapshot } = await import('./controllers/activityController.js');
        const { fetchAndCacheCompanyProfits } = await import('./controllers/companyProfitController.js');
        const { sendInvestmentTciAlerts, sendArmoryLowStockAlerts } = await import('./controllers/webhookController.js');
        const { syncUserKeys } = await import('./controllers/authController.js');
        const { fetchAndCacheFactionCrimes } = await import('./controllers/ocController.js');
        ctx.waitUntil(
          takeEnergySnapshot(env)
            .then(r => console.log('[cron] energy snapshot:', JSON.stringify(r)))
            .catch(e => console.error('[cron] energy snapshot failed:', e))
            .then(() => takePersonalStatsSnapshot(env))
            .catch(e => console.error('[cron] personal stats snapshot failed:', e))
            .then(() => fetchAndCacheCompanyProfits(env))
            .then(r => console.log(`[cron] company profits: ${r.fetched} fetched, ${r.skipped} skipped`))
            .catch(e => console.error('[cron] company profits failed:', e))
            .then(() => sendInvestmentTciAlerts(env))
            .then(r => console.log(`[cron] TCI alerts: ${JSON.stringify(r)}`))
            .catch(e => console.error('[cron] TCI alerts failed:', e))
            .then(() => sendArmoryLowStockAlerts(env))
            .catch(e => console.error('[cron] armory alerts failed:', e))
            .then(() => syncUserKeys(env))
            .then(r => console.log(`[cron] user key sync: ${r.checked} checked, ${r.updated} updated, ${r.errors} errors`))
            .catch(e => console.error('[cron] user key sync failed:', e))
            .then(() => fetchAndCacheFactionCrimes(env))
            .then(r => console.log(`[cron] OC crimes: ${r.fetched}/3 factions, ${r.crimesUpserted} crimes upserted`))
            .catch(e => console.error('[cron] OC crimes fetch failed:', e))
        );
      } catch (e) {
        console.error('[cron] daily snapshot handler error:', e);
      }
      return;
    }

    // "0 2 1 * *" — 1st of month 02:00 UTC: stock monthly payout summary
    if (event.cron === '0 2 1 * *') {
      try {
        const { sendStockMonthlyPayouts } = await import('./controllers/webhookController.js');
        ctx.waitUntil(
          sendStockMonthlyPayouts(env)
            .then(r => console.log('[cron] stock monthly payouts:', JSON.stringify(r)))
            .catch(e => console.error('[cron] stock monthly payouts failed:', e))
        );
      } catch (e) {
        console.error('[cron] monthly payout handler error:', e);
      }
      return;
    }

    // "0 14 * * 2" — Tuesday 14:00 UTC: ranked war match check + weekly chain history fetch (matchups announced 14:00 UTC)
    if (event.cron === '0 14 * * 2') {
      try {
        const { checkWarMatches } = await import('./controllers/warController.js');
        const { fetchAndCacheChains } = await import('./controllers/chainController.js');
        ctx.waitUntil(
          checkWarMatches(env)
            .then(r => console.log('[cron] war match check complete:', JSON.stringify(r)))
            .catch(e => console.error('[cron] war match check failed:', e))
            .then(() => fetchAndCacheChains(env))
            .then(r => {
              console.log(`[cron] chain cache refresh complete: ${r.added} new chains added`);
              if (r.errors?.length) console.warn('[cron] chain refresh errors:', r.errors);
            })
            .catch(e => console.error('[cron] chain cache refresh failed:', e))
        );
      } catch (error) {
        console.error('[cron] Tuesday handler error:', error);
      }
      return;
    }

    // "*/10 * * * *" — every 10 minutes: check for new war matches + track active/matched wars
    if (event.cron === '*/10 * * * *') {
      try {
        const { checkWarMatches, trackActiveWars } = await import('./controllers/warController.js');
        ctx.waitUntil((async () => {
          // Always run checkWarMatches — it discovers new matches and must not be gated
          const matchR = await checkWarMatches(env).catch(e => { console.error('[cron] war match check failed:', e); return []; });
          if (matchR.length) console.log('[cron] war match check:', JSON.stringify(matchR));

          // Only poll active/matched wars if any exist — avoids 9 Torn API calls during quiet weeks
          const { count } = await env.DB.prepare(
            `SELECT COUNT(*) as count FROM ranked_wars WHERE status IN ('active','matched')`
          ).first();
          if (!count) return;

          const trackR = await trackActiveWars(env).catch(e => { console.error('[cron] war tracking failed:', e); return { checked: 0 }; });
          if (trackR.checked > 0) console.log(`[cron] war tracking: ${trackR.checked} wars checked`);

          // Armory deposits (Energy Repaid, war Armory tab) also refresh on this
          // 10-min cadence while a war is active/matched — the general 6-hour
          // cron alone left too wide a gap for anything time-sensitive to a war.
          const { fetchAndCacheArmoryDeposits } = await import('./controllers/armoryController.js');
          const depR = await fetchAndCacheArmoryDeposits(env).catch(e => { console.error('[cron] armory deposits (war cadence) failed:', e); return { inserted: 0 }; });
          if (depR.inserted > 0) console.log(`[cron] armory deposits (war cadence): ${depR.inserted} new`);
        })());
      } catch (error) {
        console.error('[cron] war tracking handler error:', error);
      }
      return;
    }

    // "*/5 * * * *" — stock list cache refresh every 5 minutes
    if (event.cron === '*/5 * * * *') {
      try {
        const { fetchAndCacheStockList } = await import('./services/stocksService.js');
        ctx.waitUntil(
          fetchAndCacheStockList(env)
            .then(r => console.log(`[cron] stock list cached: ${r.count} stocks`))
            .catch(e => console.error('[cron] stock list cache failed:', e))
        );
      } catch (e) {
        console.error('[cron] stock list handler error:', e);
      }
      return;
    }

    // "0 * * * *" — per-stock price history every hour
    if (event.cron === '0 * * * *') {
      try {
        const { fetchAndCacheStockDetail } = await import('./services/stocksService.js');
        ctx.waitUntil(
          fetchAndCacheStockDetail(env)
            .then(r => {
              console.log(`[cron] stock detail cached: ${r.fetched}/35`);
              if (r.errors?.length) console.warn('[cron] stock detail errors:', r.errors);
            })
            .catch(e => console.error('[cron] stock detail cache failed:', e))
        );
      } catch (e) {
        console.error('[cron] stock detail handler error:', e);
      }
      return;
    }

    // "0 */6 * * *" — armory cache + item prices refresh every 6 hours
    if (event.cron === '0 */6 * * *') {
      try {
        const { fetchAndCacheArmory, fetchAndCacheItemPrices, fetchAndCacheArmoryDeposits } = await import('./controllers/armoryController.js');
        ctx.waitUntil(
          fetchAndCacheArmory(env)
            .then(r => {
              console.log(`[cron] armory cache refresh: ${r.fetched}/3 factions`);
              if (r.errors?.length) console.warn('[cron] armory errors:', r.errors);
            })
            .catch(e => console.error('[cron] armory cache refresh failed:', e))
            .then(() => fetchAndCacheItemPrices(env))
            .then(r => console.log(`[cron] item prices cached: ${r.count} items`))
            .catch(e => console.error('[cron] item prices cache failed:', e))
            .then(() => fetchAndCacheArmoryDeposits(env))
            .then(r => {
              console.log(`[cron] armory deposits: ${r.fetched}/3 factions, ${r.inserted} new`);
              if (r.errors?.length) console.warn('[cron] armory deposit errors:', r.errors);
            })
            .catch(e => console.error('[cron] armory deposits failed:', e))
        );
      } catch (e) {
        console.error('[cron] armory handler error:', e);
      }
      return;
    }

    // "15 */12 * * *" — faction cache refresh + member sync (00:15 and 12:15 UTC)
    if (event.cron === '15 */12 * * *') try {
      const { fetchAndCacheFactions, getRandomUserApiKey } = await import('./services/tornApiService.js');
      const { syncMembersFromCache } = await import('./controllers/memberController.js');

      const apiKeyObj = await getRandomUserApiKey(env);
      if (!apiKeyObj?.key) {
        console.warn('No user API keys available for scheduled cache refresh');
        return;
      }

      const factionIds = [33097, 9171, 9728];

      console.log('Starting scheduled faction cache refresh...');

      ctx.waitUntil(
        fetchAndCacheFactions(env, factionIds, apiKeyObj, 'cron')
          .then(async (factionResult) => {
            console.log(`Faction cache refresh complete: ${factionResult.fetched} factions`);

            // Sync faction members from the freshly-cached data (no extra API calls)
            try {
              const memberResult = await syncMembersFromCache(env);
              console.log(
                `Member sync complete: ${memberResult.synced} synced, ` +
                `${memberResult.added} new, ${memberResult.departed} departed`
              );
              if (memberResult.errors.length) {
                console.warn('Member sync errors:', memberResult.errors);
              }
            } catch (memberErr) {
              console.error('Member sync failed:', memberErr);
            }
          }).catch(error => {
            console.error('Scheduled faction cache refresh failed:', error);
          })
      );
    } catch (error) {
      console.error('Scheduled event handler error:', error);
    }
  }
};
