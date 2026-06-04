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
    try {
      const { fetchAndCacheFactions, fetchAndCacheCompanies, getRandomUserApiKey } = await import('./services/tornApiService.js');

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
          fetchAndCacheCompanies(env, companyIds, apiKey)
        ]).then(([factionResult, companyResult]) => {
          console.log(`Scheduled refresh complete: ${factionResult.fetched} factions, ${companyResult.fetched} companies`);
        }).catch(error => {
          console.error('Scheduled cache refresh failed:', error);
        })
      );
    } catch (error) {
      console.error('Scheduled event handler error:', error);
    }
  }
};
