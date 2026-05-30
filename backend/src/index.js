import { handleRequest } from './routes.js';
import { errorHandler } from './middleware/errorHandler.js';

export default {
  async fetch(request, env, ctx) {
    try {
      // Add CORS headers to response
      const response = await handleRequest(request, env);

      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', env.CORS_ORIGIN);
      headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
      headers.set('Access-Control-Allow-Credentials', 'true');

      // Handle preflight requests
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers });
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      return errorHandler(error);
    }
  },
};
