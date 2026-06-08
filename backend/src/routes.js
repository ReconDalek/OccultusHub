import { verifyToken, requireAdmin, requireLeadership } from './middleware/auth.js';
import { errorResponse, jsonResponse } from './middleware/errorHandler.js';
import * as authController from './controllers/authController.js';
import * as adminController from './controllers/adminController.js';
import * as cacheController from './controllers/cacheController.js';
import * as eventsController from './controllers/eventsController.js';
import * as discordController from './controllers/discordController.js';
import * as noticesController from './controllers/noticesController.js';
import * as cipherController from './controllers/cipherController.js';
import * as fishingController from './controllers/fishingController.js';
import * as runeController from './controllers/runeController.js';
import * as chainController from './controllers/chainController.js';
import * as memberController from './controllers/memberController.js';
import * as warController from './controllers/warController.js';
import * as customHitsController from './controllers/customHitsController.js';
import * as gameController from './controllers/gameController.js';

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

  if (pathname === '/api/settings/public' && method === 'GET') {
    return adminController.getPublicSettings(request, env);
  }

  if (pathname === '/api/faction-cache' && method === 'GET') {
    return cacheController.getFactionCache(request, env);
  }

  if (pathname === '/api/company-cache' && method === 'GET') {
    return cacheController.getCompanyCache(request, env);
  }

  if (pathname === '/api/cipher/today' && method === 'GET') {
    return cipherController.getTodayCipher(request, env);
  }

  if (pathname === '/api/wars/summary' && method === 'GET') {
    return warController.getWarsSummary(request, env);
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

    if (pathname === '/api/admin/fishing/reset' && method === 'POST') {
      return fishingController.resetLeaderboard(request, env, user);
    }

    if (pathname === '/api/admin/runes/reset' && method === 'POST') {
      return runeController.resetLeaderboard(request, env, user);
    }

    // Chain cache endpoints
    if (pathname === '/api/admin/chains/status' && method === 'GET') {
      return chainController.getChainCacheStatus(request, env, user);
    }

    if (pathname === '/api/admin/chains/refresh' && method === 'POST') {
      return chainController.refreshChainsAdmin(request, env, user);
    }

    // Member database endpoints
    if (pathname === '/api/admin/members/status' && method === 'GET') {
      return memberController.getMemberSyncStatus(request, env, user);
    }

    if (pathname === '/api/admin/members/sync' && method === 'POST') {
      return memberController.triggerMemberSync(request, env, user);
    }

    if (pathname === '/api/admin/wars/check' && method === 'POST') {
      return warController.triggerWarCheck(request, env, user);
    }
    if (pathname === '/api/admin/wars/backfill' && method === 'POST') {
      return warController.backfillHistoricWars(request, env);
    }
  }

  // Fishing endpoints
  if (pathname === '/api/fishing/cast' && method === 'POST') {
    if (!user) return errorResponse('Authentication required', 401);
    return fishingController.startCast(request, env, user);
  }

  if (pathname === '/api/fishing/leaderboard' && method === 'GET') {
    return fishingController.getLeaderboard(request, env);
  }

  if (pathname === '/api/fishing/catch' && method === 'POST') {
    if (!user) return errorResponse('Authentication required', 401);
    return fishingController.recordCatch(request, env, user);
  }

  if (pathname === '/api/fishing/stats' && method === 'GET') {
    if (!user) return errorResponse('Authentication required', 401);
    return fishingController.getUserStats(request, env, user);
  }

  if (pathname === '/api/runes/cast' && method === 'POST') {
    if (!user) return errorResponse('Authentication required', 401);
    return runeController.startCast(request, env, user);
  }

  if (pathname === '/api/runes/record' && method === 'POST') {
    if (!user) return errorResponse('Authentication required', 401);
    return runeController.recordCast(request, env, user);
  }

  if (pathname === '/api/runes/leaderboard' && method === 'GET') {
    return runeController.getLeaderboard(request, env);
  }

  // Cipher submit — open to all (authenticated or guest)
  if (pathname === '/api/cipher/submit' && method === 'POST') {
    return cipherController.submitAnswer(request, env, user);
  }

  // Leadership-gated endpoints
  if (pathname.startsWith('/api/leadership/')) {
    if (!user) return errorResponse('Authentication required', 401);
    const isLeader = await requireLeadership(user);
    if (!isLeader) return errorResponse('Leadership access required', 403);

    if (pathname === '/api/leadership/notices' && method === 'GET') {
      return noticesController.getNotices(request, env);
    }
    if (pathname === '/api/leadership/notices' && method === 'POST') {
      return noticesController.createNotice(request, env, user);
    }
    if (pathname.match(/^\/api\/leadership\/notices\/\d+$/) && method === 'DELETE') {
      return noticesController.deleteNotice(request, env);
    }
    if (pathname === '/api/leadership/cipher-submissions' && method === 'GET') {
      return cipherController.getCipherSubmissions(request, env);
    }

    if (pathname === '/api/leadership/events' && method === 'POST') {
      return eventsController.createEvent(request, env, user);
    }
    if (pathname === '/api/leadership/events/import-torn' && method === 'POST') {
      return eventsController.importTornEvents(request, env, user);
    }
    if (pathname.match(/^\/api\/leadership\/events\/\d+$/) && method === 'PUT') {
      return eventsController.updateEvent(request, env, user);
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
    if (pathname.match(/^\/api\/leadership\/faction-schedules\/\d+\/advance$/) && method === 'POST') {
      return eventsController.advanceFactionSchedule(request, env, user);
    }

    // Chain tracking — read chain cache per faction
    if (pathname === '/api/leadership/chains' && method === 'GET') {
      return chainController.getChains(request, env);
    }

    // Chain report — live proxy to Torn API (cached by frontend)
    if (pathname === '/api/leadership/chain-report' && method === 'GET') {
      return chainController.getChainReport(request, env);
    }

    // Save member hit contributions for a chain
    if (pathname === '/api/leadership/chain-hits' && method === 'POST') {
      return chainController.saveChainHits(request, env, user);
    }

    // Manually import a historical chain (metadata + hits in one shot, no minimum)
    if (pathname === '/api/leadership/chain-import' && method === 'POST') {
      return chainController.saveChainImport(request, env, user);
    }

    // Faction member list with chain hit totals (for Ranks tab)
    if (pathname === '/api/leadership/members' && method === 'GET') {
      return memberController.getFactionMembers(request, env);
    }

    // War tracking endpoints
    if (pathname === '/api/leadership/wars' && method === 'GET') {
      return warController.getWars(request, env);
    }
    if (pathname.match(/^\/api\/leadership\/war\/\d+\/armory$/) && method === 'GET') {
      return warController.getWarArmory(request, env);
    }
    if (pathname.match(/^\/api\/leadership\/war\/\d+\/payout$/) && method === 'GET') {
      return warController.getWarPayout(request, env);
    }
    if (pathname.match(/^\/api\/leadership\/war\/\d+\/payout$/) && method === 'POST') {
      return warController.saveWarPayout(request, env);
    }
    if (pathname.match(/^\/api\/leadership\/war\/\d+\/save-hits$/) && method === 'POST') {
      return warController.saveWarHits(request, env, user);
    }
    if (pathname === '/api/leadership/wars/manual' && method === 'POST') {
      return warController.createManualWar(request, env, user);
    }
    if (pathname.match(/^\/api\/leadership\/war\/\d+$/) && method === 'GET') {
      return warController.getWarDetails(request, env);
    }

    // Custom / miscellaneous hits
    if (pathname === '/api/leadership/custom-hits' && method === 'GET') {
      return customHitsController.getCustomHits(request, env);
    }
    if (pathname === '/api/leadership/custom-hits' && method === 'POST') {
      return customHitsController.saveCustomHits(request, env, user);
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

  // Game Room — The Rite (public + optional auth)
  if (pathname === '/api/game/current' && method === 'GET') {
    return gameController.getCurrentRoom(request, env);
  }
  if (pathname === '/api/game/current/join' && method === 'POST') {
    return gameController.joinOrCreate(request, env, user);
  }
  if (pathname === '/api/game/rooms' && method === 'POST') {
    return gameController.createRoom(request, env, user);
  }
  if (pathname.match(/^\/api\/game\/rooms\/[A-Z0-9]{6}$/) && method === 'GET') {
    return gameController.getRoom(request, env, user);
  }
  if (pathname.match(/^\/api\/game\/rooms\/[A-Z0-9]{6}\/join$/) && method === 'POST') {
    return gameController.joinRoom(request, env, user);
  }
  if (pathname.match(/^\/api\/game\/rooms\/[A-Z0-9]{6}\/leave$/) && method === 'POST') {
    return gameController.leaveRoom(request, env, user);
  }
  if (pathname.match(/^\/api\/game\/rooms\/[A-Z0-9]{6}\/start$/) && method === 'POST') {
    return gameController.startGame(request, env, user);
  }
  if (pathname.match(/^\/api\/game\/rooms\/[A-Z0-9]{6}\/message$/) && method === 'POST') {
    return gameController.sendMessage(request, env, user);
  }
  if (pathname.match(/^\/api\/game\/rooms\/[A-Z0-9]{6}\/vote$/) && method === 'POST') {
    return gameController.castVote(request, env, user);
  }
  if (pathname.match(/^\/api\/game\/rooms\/[A-Z0-9]{6}\/action$/) && method === 'POST') {
    return gameController.submitAction(request, env, user);
  }
  if (pathname.match(/^\/api\/game\/rooms\/[A-Z0-9]{6}\/advance$/) && method === 'POST') {
    return gameController.advancePhase(request, env, user);
  }
  if (pathname.match(/^\/api\/game\/rooms\/[A-Z0-9]{6}\/inquisitor-messages$/) && method === 'GET') {
    return gameController.getInquisitorMessages(request, env, user);
  }

  // 404 - Not found
  return errorResponse('Endpoint not found', 404);
}
