import { verifyToken, requireAdmin, requireLeadership } from './middleware/auth.js';
import { errorResponse, jsonResponse } from './middleware/errorHandler.js';
import * as authController from './controllers/authController.js';
import * as adminController from './controllers/adminController.js';
import * as cacheController from './controllers/cacheController.js';
import * as eventsController from './controllers/eventsController.js';
import * as discordController from './controllers/discordController.js';

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const method = request.method;

  // Health check endpoint
  if (pathname === '/api/health' && method === 'GET') {
    return jsonResponse({ status: 'ok' });
  }

  // Public endpoints (no auth required)
  if (pathname === '/api/auth/login' && method === 'POST') {
    return authController.login(request, env);
  }

  if (pathname === '/api/pages/visibility' && method === 'GET') {
    return adminController.getPages(request, env, null);
  }

  if (pathname === '/api/faction-cache' && method === 'GET') {
    return cacheController.getFactionCache(request, env);
  }

  if (pathname === '/api/company-cache' && method === 'GET') {
    return cacheController.getCompanyCache(request, env);
  }

  if (pathname === '/api/events' && method === 'GET') {
    return eventsController.getEvents(request, env);
  }

  if (pathname === '/api/faction-schedules' && method === 'GET') {
    return eventsController.getFactionSchedules(request, env);
  }

  // Protected endpoints (auth required)
  const user = await verifyToken(request, env);

  if (pathname === '/api/auth/session' && method === 'GET') {
    if (!user) return errorResponse('No token provided', 401);
    return authController.session(request, env, user);
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    if (!user) return errorResponse('No token provided', 401);
    return authController.logout(request, env, user);
  }

  // Admin-only endpoints
  if (pathname.startsWith('/api/admin/')) {
    if (!user) return errorResponse('No token provided', 401);

    const isAdmin = await requireAdmin(user);
    if (!isAdmin) return errorResponse('Admin access required', 403);

    // User management endpoints
    if (pathname === '/api/admin/users' && method === 'GET') {
      return adminController.getAllUsers(request, env, user);
    }

    if (pathname.match(/^\/api\/admin\/users\/\d+\/history$/) && method === 'GET') {
      return adminController.getUserHistory(request, env, user);
    }

    if (pathname.match(/^\/api\/admin\/users\/\d+\/grant$/) && method === 'POST') {
      return adminController.grantAdmin(request, env, user);
    }

    if (pathname.match(/^\/api\/admin\/users\/\d+\/revoke$/) && method === 'POST') {
      return adminController.revokeAdmin(request, env, user);
    }

    // Page visibility endpoints
    if (pathname === '/api/admin/pages' && method === 'GET') {
      return adminController.getPages(request, env, user);
    }

    if (pathname.match(/^\/api\/admin\/pages\/[a-z]+\/toggle$/) && method === 'POST') {
      return adminController.togglePage(request, env, user);
    }

    // Cache endpoints
    if (pathname === '/api/admin/cache/status' && method === 'GET') {
      return adminController.getCacheStatus(request, env, user);
    }

    if (pathname === '/api/admin/cache/refresh' && method === 'POST') {
      return adminController.refreshCache(request, env, user);
    }

    // Analytics endpoint
    if (pathname === '/api/admin/analytics' && method === 'GET') {
      return adminController.getAnalytics(request, env, user);
    }

    // Settings endpoints
    if (pathname === '/api/admin/settings' && method === 'GET') {
      return adminController.getSettings(request, env, user);
    }

    if (pathname.match(/^\/api\/admin\/settings\/[^/]+$/) && method === 'POST') {
      return adminController.updateSetting(request, env, user);
    }
  }

  // Leadership-gated endpoints
  if (pathname.startsWith('/api/leadership/')) {
    if (!user) return errorResponse('Authentication required', 401);
    const isLeader = await requireLeadership(user);
    if (!isLeader) return errorResponse('Leadership access required', 403);

    if (pathname === '/api/leadership/events' && method === 'POST') {
      return eventsController.createEvent(request, env, user);
    }
    if (pathname.match(/^\/api\/leadership\/events\/\d+$/) && method === 'DELETE') {
      return eventsController.deleteEvent(request, env, user);
    }
    if (pathname === '/api/leadership/faction-schedules' && method === 'POST') {
      return eventsController.createFactionSchedule(request, env, user);
    }
    if (pathname.match(/^\/api\/leadership\/faction-schedules\/\d+$/) && method === 'DELETE') {
      return eventsController.deleteFactionSchedule(request, env, user);
    }
  }

  // Discord endpoints
  if (pathname === '/api/discord/callback' && method === 'GET') {
    return discordController.handleCallback(request, env);
  }

  if (pathname.startsWith('/api/discord/')) {
    if (!user) return errorResponse('Authentication required', 401);

    if (pathname === '/api/discord/auth' && method === 'GET') {
      return discordController.getAuthUrl(request, env, user);
    }
    if (pathname === '/api/discord/status' && method === 'GET') {
      return discordController.getStatus(request, env, user);
    }
    if (pathname === '/api/discord/unlink' && method === 'DELETE') {
      return discordController.unlinkDiscord(request, env, user);
    }
    if (pathname === '/api/discord/channels' && method === 'GET') {
      return discordController.getChannels(request, env, user);
    }
    if (pathname === '/api/discord/messages' && method === 'GET') {
      return discordController.getMessages(request, env, user);
    }
    if (pathname === '/api/discord/messages' && method === 'POST') {
      return discordController.sendMessage(request, env, user);
    }
  }

  // 404 - Not found
  return errorResponse('Endpoint not found', 404);
}
