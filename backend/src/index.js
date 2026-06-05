import { handleRequest } from './routes.js';
import { errorHandler } from './middleware/errorHandler.js';

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': env.CORS_ORIGIN,
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Credentials': 'true',
    };

    // Handle preflight before any route logic
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      const response = await handleRequest(request, env);
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
    // "0 9 * * 1" — weekly chain history refresh (Monday 09:00 UTC)
    if (event.cron === '0 9 * * 1') {
      try {
        const { fetchAndCacheChains } = await import('./controllers/chainController.js');
        console.log('Starting scheduled chain cache refresh...');
        ctx.waitUntil(
          fetchAndCacheChains(env).then((result) => {
            console.log(`Chain cache refresh complete: ${result.added} new chains added`);
            if (result.errors.length) console.warn('Chain refresh errors:', result.errors);
          }).catch((err) => {
            console.error('Scheduled chain refresh failed:', err);
          })
        );
      } catch (error) {
        console.error('Chain scheduled event handler error:', error);
      }
      return;
    }

    // "0 */12 * * *" — faction/company cache refresh every 12 hours
    try {
      const { fetchAndCacheFactions, fetchAndCacheCompanies, getRandomUserApiKey } = await import('./services/tornApiService.js');
      const { syncMembersFromCache } = await import('./controllers/memberController.js');

      const apiKey = await getRandomUserApiKey(env);
      if (!apiKey) {
        console.warn('No user API keys available for scheduled cache refresh');
        return;
      }

      const factionIds = [33097, 9171, 9728];
      const companyIds = [112941, 120244, 121745, 122254, 120502, 124650];

      console.log('Starting scheduled cache refresh...');

      ctx.waitUntil(
        Promise.all([
          fetchAndCacheFactions(env, factionIds, apiKey),
          fetchAndCacheCompanies(env, companyIds, apiKey),
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
