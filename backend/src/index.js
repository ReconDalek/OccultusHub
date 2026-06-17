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
    // "0 1 * * *" — daily 01:00 UTC: energy snapshot + personal stats snapshot
    if (event.cron === '0 1 * * *') {
      try {
        const { takeEnergySnapshot, takePersonalStatsSnapshot } = await import('./controllers/activityController.js');
        ctx.waitUntil(
          takeEnergySnapshot(env)
            .then(r => console.log('[cron] energy snapshot:', JSON.stringify(r)))
            .catch(e => console.error('[cron] energy snapshot failed:', e))
            .then(() => takePersonalStatsSnapshot(env))
            .catch(e => console.error('[cron] personal stats snapshot failed:', e))
        );
      } catch (e) {
        console.error('[cron] daily snapshot handler error:', e);
      }
      return;
    }

    // "0 1 * * 2" — Tuesday 01:00 UTC: ranked war match check + weekly chain history fetch
    if (event.cron === '0 1 * * 2') {
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

    // "*/30 * * * *" — every 30 minutes: check for new war matches + track active/matched wars
    if (event.cron === '*/30 * * * *') {
      try {
        const { checkWarMatches, trackActiveWars } = await import('./controllers/warController.js');
        ctx.waitUntil(
          checkWarMatches(env)
            .then(r => { if (r.length) console.log('[cron] war match check:', JSON.stringify(r)); })
            .catch(e => console.error('[cron] war match check failed:', e))
            .then(() => trackActiveWars(env))
            .then(r => { if (r.checked > 0) console.log(`[cron] war tracking: ${r.checked} wars checked`); })
            .catch(e => console.error('[cron] war tracking failed:', e))
        );
      } catch (error) {
        console.error('[cron] war tracking handler error:', error);
      }
      return;
    }

    // "0 */12 * * *" — faction/company cache refresh every 12 hours
    try {
      const { fetchAndCacheFactions, fetchAndCacheCompanies, getRandomUserApiKey } = await import('./services/tornApiService.js');
      const { syncMembersFromCache } = await import('./controllers/memberController.js');

      const apiKeyObj = await getRandomUserApiKey(env);
      if (!apiKeyObj?.key) {
        console.warn('No user API keys available for scheduled cache refresh');
        return;
      }

      const factionIds = [33097, 9171, 9728];
      const companyIds = [112941, 120244, 121745, 122254, 120502, 124650];

      console.log('Starting scheduled cache refresh...');

      ctx.waitUntil(
        Promise.all([
          fetchAndCacheFactions(env, factionIds, apiKeyObj, 'cron'),
          fetchAndCacheCompanies(env, companyIds, apiKeyObj, 'cron'),
        ]).then(async ([factionResult, companyResult]) => {
          console.log(`Cache refresh complete: ${factionResult.fetched} factions, ${companyResult.fetched} companies`);

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
          console.error('Scheduled cache refresh failed:', error);
        })
      );
    } catch (error) {
      console.error('Scheduled event handler error:', error);
    }
  }
};
