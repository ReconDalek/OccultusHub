import { verifyToken, requireAdmin, requireLeadership, getMentoringAccess } from './middleware/auth.js';
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
import * as cahController from './controllers/cahController.js';
import * as forumsController from './controllers/forumsController.js';
import * as sanctumController from './controllers/sanctumController.js';
import * as pactController from './controllers/pactController.js';
import * as activityController from './controllers/activityController.js';
import * as logsController from './controllers/logsController.js';
import * as accountingController from './controllers/accountingController.js';
import * as stocksController from './controllers/stocksController.js'
import * as armoryController from './controllers/armoryController.js';
import * as companyProfitController from './controllers/companyProfitController.js';
import * as webhookController from './controllers/webhookController.js';
import * as bindingController from './controllers/bindingController.js';
import * as warningsController from './controllers/warningsController.js';
import * as exemptionsController from './controllers/exemptionsController.js';
import * as warningExclusionsController from './controllers/warningExclusionsController.js';
import * as mentoringController from './controllers/mentoringController.js';
import * as ocController from './controllers/ocController.js';
import * as xanaxController from './controllers/xanaxController.js';
import * as bountyController from './controllers/bountyController.js';
import * as leaderboardController from './controllers/leaderboardController.js';
import * as memberProfileController from './controllers/memberProfileController.js';
import * as progressionController from './controllers/progressionController.js';

export async function handleRequest(request, env, ctx) {
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

  // Public — Discord bot + anything else reads current leaderboard standings here
  if (pathname === '/api/leaderboards' && method === 'GET') {
    return leaderboardController.getPublicLeaderboards(request, env);
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

    if (pathname.match(/^\/api\/admin\/users\/\d+\/access-override$/) && method === 'POST') {
      return adminController.setAccessOverride(request, env, user);
    }

    // Cache endpoints
    if (pathname === '/api/admin/cache/status' && method === 'GET') {
      return adminController.getCacheStatus(request, env, user);
    }

    if (pathname === '/api/admin/cache/refresh' && method === 'POST') {
      return adminController.refreshCache(request, env, user);
    }

    if (pathname === '/api/admin/armory/status' && method === 'GET') {
      return armoryController.getArmoryStatus(request, env, user);
    }
    if (pathname === '/api/admin/armory/refresh' && method === 'POST') {
      return armoryController.refreshArmoryCache(request, env, user);
    }
    if (pathname === '/api/admin/armory/deposits/status' && method === 'GET') {
      return armoryController.getArmoryDepositsStatus(request, env, user);
    }
    if (pathname === '/api/admin/armory/deposits/refresh' && method === 'POST') {
      return armoryController.refreshArmoryDeposits(request, env, user);
    }
    if (pathname === '/api/admin/armory/minimums' && method === 'GET') {
      return armoryController.getArmoryMinimums(request, env, user);
    }
    if (pathname === '/api/admin/armory/minimums' && method === 'POST') {
      return armoryController.saveArmoryMinimums(request, env, user);
    }
    if (pathname === '/api/admin/item-prices/status' && method === 'GET') {
      return armoryController.getItemPricesStatus(request, env, user);
    }
    if (pathname === '/api/admin/item-prices/refresh' && method === 'POST') {
      return armoryController.refreshItemPricesCache(request, env, user);
    }
    if (pathname === '/api/admin/company-profits/status' && method === 'GET') {
      return companyProfitController.getCompanyProfitStatus(request, env, user);
    }
    if (pathname === '/api/admin/company-profits/refresh' && method === 'POST') {
      return companyProfitController.refreshCompanyProfitCache(request, env, user);
    }
    if (pathname === '/api/admin/oc/status' && method === 'GET') {
      return ocController.getOcStatus(request, env, user);
    }
    if (pathname === '/api/admin/oc/refresh' && method === 'POST') {
      return ocController.refreshOcCrimes(request, env, user);
    }

    // Webhook configs
    if (pathname === '/api/admin/webhooks' && method === 'GET') {
      return webhookController.getWebhookConfigs(request, env, user);
    }
    if (pathname === '/api/admin/webhooks' && method === 'POST') {
      return webhookController.upsertWebhookConfig(request, env, user);
    }
    if (pathname.match(/^\/api\/admin\/webhooks\/[^/]+\/trigger$/) && method === 'POST') {
      return webhookController.triggerWebhook(request, env, user);
    }
    if (pathname.match(/^\/api\/admin\/webhooks\/[^/]+\/test$/) && method === 'POST') {
      return webhookController.sendTestMessage(request, env, user);
    }
    if (pathname.match(/^\/api\/admin\/webhooks\/[^/]+\/preview$/) && method === 'POST') {
      return webhookController.previewWebhook(request, env, user);
    }

    // Analytics endpoint
    if (pathname === '/api/admin/analytics' && method === 'GET') {
      return adminController.getAnalytics(request, env, user);
    }

    if (pathname === '/api/admin/fishing/reset' && method === 'POST') {
      return fishingController.resetLeaderboard(request, env, user);
    }

    if (pathname === '/api/admin/runes/reset' && method === 'POST') {
      return runeController.resetLeaderboard(request, env, user);
    }

    if (pathname === '/api/admin/sanctum/reset' && method === 'POST') {
      return sanctumController.resetLeaderboard(request, env, user);
    }

    if (pathname === '/api/admin/pact/practice' && method === 'POST') {
      return pactController.adminPractice(request, env, user);
    }
    if (pathname === '/api/admin/pact/reset' && method === 'POST') {
      return pactController.adminReset(request, env, user);
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

    if (pathname === '/api/admin/users/sync-keys' && method === 'POST') {
      return authController.triggerUserKeySyncAdmin(request, env);
    }

    if (pathname === '/api/admin/wars/check' && method === 'POST') {
      return warController.triggerWarCheck(request, env, user);
    }
    if (pathname === '/api/admin/wars/backfill' && method === 'POST') {
      return warController.backfillHistoricWars(request, env);
    }

    if (pathname === '/api/admin/logs' && method === 'GET') {
      return logsController.getLogs(request, env);
    }
    if (pathname.match(/^\/api\/admin\/logs\/\d+$/) && method === 'DELETE') {
      return logsController.deleteLog(request, env);
    }

    // Energy snapshot admin
    if (pathname === '/api/admin/energy/snapshot' && method === 'POST') {
      return activityController.triggerEnergySnapshotAdmin(request, env);
    }

    // Personal stats snapshot admin
    if (pathname === '/api/admin/personal-stats/status' && method === 'GET') {
      return activityController.getPersonalStatsSnapshotStatus(request, env);
    }
    if (pathname === '/api/admin/personal-stats/snapshot' && method === 'POST') {
      return activityController.triggerPersonalStatsSnapshotAdmin(request, env);
    }
  }

  // Activity endpoints (leadership)
  if (pathname === '/api/leadership/energy' && method === 'GET') {
    if (!user) return errorResponse('Authentication required', 401);
    if (!(await requireLeadership(user, env))) return errorResponse('Leadership access required', 403);
    return activityController.getEnergyActivity(request, env);
  }
  if (pathname === '/api/leadership/energy/member-breakdown' && method === 'GET') {
    if (!user) return errorResponse('Authentication required', 401);
    if (!(await requireLeadership(user, env))) return errorResponse('Leadership access required', 403);
    return activityController.getEnergyMemberBreakdown(request, env);
  }

  // Member profile card — self-view always allowed, viewing another member
  // requires leadership (checked inside the controller since it depends on
  // whether the requested id matches the caller's own).
  const memberProfileMatch = pathname.match(/^\/api\/members\/(\d+)\/profile$/);
  if (memberProfileMatch && method === 'GET') {
    if (!user) return errorResponse('Authentication required', 401);
    return memberProfileController.getMemberProfile(request, env, user);
  }

  // Navbar dropdown summary — always self, no id needed.
  if (pathname === '/api/members/nav-summary' && method === 'GET') {
    if (!user) return errorResponse('Authentication required', 401);
    return memberProfileController.getNavSummary(request, env, user);
  }

  // Mentor/mentee program — registered outside the blanket /api/leadership/
  // gate (like the routes above) because mentors need access too, not just
  // leadership. Every mutation is leader-only except updateMentee/complete/
  // remove, which a mentor may use on mentees assigned to them — enforced
  // inside the controller via `access`, not here.
  if (pathname === '/api/mentoring/my-access' && method === 'GET') {
    if (!user) return errorResponse('Authentication required', 401);
    const access = await getMentoringAccess(user, env);
    return mentoringController.getMyMentoringAccess(request, env, user, access);
  }
  if (pathname.startsWith('/api/leadership/mentoring/')) {
    if (!user) return errorResponse('Authentication required', 401);
    const access = await getMentoringAccess(user, env);
    if (!access.isLeader && !access.isMentor) return errorResponse('Leadership or mentor access required', 403);

    if (pathname === '/api/leadership/mentoring/overview' && method === 'GET') {
      return mentoringController.getMentoringOverview(request, env, user, access);
    }
    if (pathname === '/api/leadership/mentoring/resources' && method === 'GET') {
      return mentoringController.getMentorResources(request, env, user, access);
    }
    if (pathname.match(/^\/api\/leadership\/mentoring\/mentees\/\d+\/report$/) && method === 'GET') {
      return mentoringController.getMenteeReport(request, env, user, access);
    }
    if (pathname.match(/^\/api\/leadership\/mentoring\/mentees\/\d+$/) && method === 'PUT') {
      return mentoringController.updateMentee(request, env, user, access);
    }
    if (pathname.match(/^\/api\/leadership\/mentoring\/mentees\/\d+\/complete$/) && method === 'POST') {
      return mentoringController.completeMentee(request, env, user, access);
    }
    if (pathname.match(/^\/api\/leadership\/mentoring\/mentees\/\d+\/remove$/) && method === 'POST') {
      return mentoringController.removeMentee(request, env, user, access);
    }

    // Everything below is leader-only (adding mentors/mentees/resources, the
    // member picker, mentor edits) — mentors never need these.
    if (!access.isLeader) return errorResponse('Leadership access required', 403);

    if (pathname === '/api/leadership/mentoring/members' && method === 'GET') {
      return mentoringController.getMentorshipMembers(request, env);
    }
    if (pathname === '/api/leadership/mentoring/mentors' && method === 'POST') {
      return mentoringController.addMentor(request, env, user);
    }
    if (pathname.match(/^\/api\/leadership\/mentoring\/mentors\/\d+$/) && method === 'PUT') {
      return mentoringController.updateMentor(request, env);
    }
    if (pathname === '/api/leadership/mentoring/mentees' && method === 'POST') {
      return mentoringController.addMentee(request, env, user);
    }
    if (pathname === '/api/leadership/mentoring/resources' && method === 'POST') {
      return mentoringController.addMentorResource(request, env, user);
    }
    if (pathname.match(/^\/api\/leadership\/mentoring\/resources\/\d+$/) && method === 'DELETE') {
      return mentoringController.deleteMentorResource(request, env);
    }
  }

  // Forums endpoints (member auth required)
  if (pathname === '/api/forums/posts' && method === 'GET') {
    if (!user) return errorResponse('Authentication required', 401);
    return forumsController.listPosts(request, env, user);
  }

  if (pathname === '/api/forums/posts' && method === 'POST') {
    if (!user) return errorResponse('Authentication required', 401);
    return forumsController.createPost(request, env, user);
  }

  const forumsPostMatch = pathname.match(/^\/api\/forums\/posts\/(\d+)$/);
  if (forumsPostMatch) {
    const postId = parseInt(forumsPostMatch[1]);
    if (!user) return errorResponse('Authentication required', 401);
    if (method === 'GET') return forumsController.getPost(request, env, user, postId);
    if (method === 'PUT') return forumsController.updatePost(request, env, user, postId);
    if (method === 'DELETE') return forumsController.deletePost(request, env, user, postId);
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
    const isLeader = await requireLeadership(user, env);
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

    // Chain archive — full list of saved chains (hits already recorded), for
    // browsing any historic chain beyond the most-recent-5 view
    if (pathname === '/api/leadership/chains/archive' && method === 'GET') {
      return chainController.getChainsArchive(request, env);
    }
    if (pathname.match(/^\/api\/leadership\/chains\/\d+\/hits$/) && method === 'GET') {
      return chainController.getSavedChainHits(request, env);
    }

    // One-time button: backfill armory/energy data for chains saved before this feature existed
    if (pathname === '/api/leadership/chains/energy-backfill' && method === 'POST') {
      return chainController.backfillChainEnergy(request, env, user);
    }
    // Manual retry of the armory/energy check for a single chain
    if (pathname.match(/^\/api\/leadership\/chains\/\d+\/energy$/) && method === 'POST') {
      return chainController.refetchChainEnergy(request, env, user);
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

    // Member warnings
    if (pathname === '/api/leadership/warnings/members' && method === 'GET') {
      return warningsController.getWarningMembers(request, env);
    }
    if (pathname === '/api/leadership/warnings' && method === 'GET') {
      return warningsController.getWarnings(request, env);
    }
    if (pathname === '/api/leadership/warnings' && method === 'POST') {
      return warningsController.addWarning(request, env, user);
    }
    if (pathname.match(/^\/api\/leadership\/warnings\/\d+$/) && method === 'DELETE') {
      return warningsController.deleteWarning(request, env);
    }
    if (pathname.match(/^\/api\/leadership\/warnings\/\d+\/comment$/) && method === 'PUT') {
      return warningsController.updateWarningComment(request, env);
    }
    if (pathname.match(/^\/api\/leadership\/warnings\/\d+$/) && method === 'PUT') {
      return warningsController.updateWarning(request, env);
    }
    if (pathname === '/api/leadership/warnings/generate/energy' && method === 'GET') {
      return activityController.generateEnergyWarningReport(request, env);
    }
    if (pathname === '/api/leadership/warnings/generate/chain' && method === 'GET') {
      return chainController.generateChainWarningReport(request, env);
    }

    // Member warning exemptions
    if (pathname === '/api/leadership/exemptions' && method === 'GET') {
      return exemptionsController.getExemptions(request, env);
    }
    if (pathname === '/api/leadership/exemptions' && method === 'POST') {
      return exemptionsController.addExemption(request, env, user);
    }
    if (pathname.match(/^\/api\/leadership\/exemptions\/\d+$/) && method === 'DELETE') {
      return exemptionsController.deleteExemption(request, env);
    }

    // Per-month "excuse this member" toggle for Warnings > Generate (lighter-weight
    // than a logged exemption — a one-off judgment call, not a standing rule)
    if (pathname === '/api/leadership/warnings/exclusions' && method === 'GET') {
      return warningExclusionsController.getWarningExclusions(request, env);
    }
    if (pathname === '/api/leadership/warnings/exclusions' && method === 'POST') {
      return warningExclusionsController.addWarningExclusion(request, env, user);
    }
    if (pathname.match(/^\/api\/leadership\/warnings\/exclusions\/\d+$/) && method === 'DELETE') {
      return warningExclusionsController.deleteWarningExclusion(request, env);
    }

    // Monthly xanax distribution tracking
    if (pathname === '/api/leadership/xanax' && method === 'GET') {
      return xanaxController.getDistributions(request, env);
    }
    if (pathname === '/api/leadership/xanax' && method === 'POST') {
      return xanaxController.markDistribution(request, env, user);
    }
    if (pathname.match(/^\/api\/leadership\/xanax\/\d+$/) && method === 'DELETE') {
      return xanaxController.deleteDistribution(request, env);
    }

    // War tracking endpoints
    if (pathname === '/api/leadership/wars' && method === 'GET') {
      return warController.getWars(request, env);
    }
    if (pathname === '/api/leadership/wars/archive' && method === 'GET') {
      return warController.getWarsArchive(request, env);
    }
    if (pathname.match(/^\/api\/leadership\/war\/\d+\/attacks$/) && method === 'GET') {
      return warController.getWarAttackLog(request, env);
    }
    if (pathname.match(/^\/api\/leadership\/war\/\d+\/verify\/apply$/) && method === 'POST') {
      return warController.applyVerifiedWarData(request, env);
    }
    if (pathname.match(/^\/api\/leadership\/war\/\d+\/verify$/) && method === 'POST') {
      return warController.verifyWarData(request, env);
    }
    if (pathname.match(/^\/api\/leadership\/war\/\d+\/armory$/) && method === 'GET') {
      return warController.getWarArmory(request, env);
    }
    if (pathname.match(/^\/api\/leadership\/war\/\d+\/economics$/) && method === 'GET') {
      return warController.getWarEconomics(request, env);
    }
    if (pathname.match(/^\/api\/leadership\/war\/\d+\/other-expenses$/) && method === 'GET') {
      return warController.getWarOtherExpenses(request, env);
    }
    if (pathname.match(/^\/api\/leadership\/war\/\d+\/other-expenses$/) && method === 'POST') {
      return warController.addWarOtherExpense(request, env, user);
    }
    if (pathname.match(/^\/api\/leadership\/war\/other-expenses\/\d+$/) && method === 'DELETE') {
      return warController.deleteWarOtherExpense(request, env);
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

    // Bounty tracking
    if (pathname === '/api/leadership/bounties' && method === 'GET') {
      return bountyController.getBounties(request, env);
    }
    if (pathname === '/api/leadership/bounties' && method === 'POST') {
      return bountyController.createBounty(request, env, user);
    }
    if (pathname === '/api/leadership/bounties/bulk-paid' && method === 'POST') {
      return bountyController.bulkSetBountiesPaid(request, env, user);
    }
    if (pathname === '/api/leadership/bounties/parse-log' && method === 'POST') {
      return bountyController.parseBountyLog(request, env, user);
    }
    if (pathname.match(/^\/api\/leadership\/bounties\/\d+$/) && method === 'PUT') {
      return bountyController.updateBounty(request, env, user);
    }
    if (pathname.match(/^\/api\/leadership\/bounties\/\d+$/) && method === 'DELETE') {
      return bountyController.deleteBounty(request, env);
    }

    // Stat-gain leaderboards (Scheduling > Leaderboards)
    if (pathname === '/api/leadership/leaderboards' && method === 'GET') {
      return leaderboardController.getLeaderboardConfigs(request, env);
    }
    if (pathname.match(/^\/api\/leadership\/leaderboards\/\w+$/) && method === 'PUT') {
      return leaderboardController.updateLeaderboardConfig(request, env, user);
    }
    if (pathname.match(/^\/api\/leadership\/leaderboards\/\w+\/active$/) && method === 'POST') {
      return leaderboardController.setLeaderboardActive(request, env, user);
    }
    if (pathname === '/api/leadership/progression' && method === 'GET') {
      return progressionController.getProgressionTrend(request, env);
    }

    // Custom / miscellaneous hits
    if (pathname === '/api/leadership/custom-hits' && method === 'GET') {
      return customHitsController.getCustomHits(request, env);
    }
    if (pathname === '/api/leadership/custom-hits' && method === 'POST') {
      return customHitsController.saveCustomHits(request, env, user);
    }

    // Accounting — settings
    if (pathname === '/api/leadership/accounting/settings' && method === 'GET') {
      return accountingController.getAccountingSettings(request, env);
    }
    if (pathname === '/api/leadership/accounting/settings' && method === 'PUT') {
      return accountingController.updateAccountingSetting(request, env);
    }

    // Accounting — investments
    if (pathname === '/api/leadership/accounting/summary' && method === 'GET') {
      return accountingController.getSummary(request, env);
    }
    if (pathname === '/api/leadership/accounting/investments' && method === 'GET') {
      return accountingController.getInvestments(request, env);
    }
    if (pathname === '/api/leadership/accounting/investments' && method === 'POST') {
      return accountingController.createInvestment(request, env, user);
    }
    if (pathname.match(/^\/api\/leadership\/accounting\/investments\/\d+$/) && method === 'PUT') {
      return accountingController.updateInvestment(request, env, user);
    }
    if (pathname.match(/^\/api\/leadership\/accounting\/investments\/\d+$/) && method === 'DELETE') {
      return accountingController.deleteInvestment(request, env);
    }

    // Accounting — stocks
    if (pathname === '/api/leadership/accounting/stocks' && method === 'GET') {
      return accountingController.getStocks(request, env);
    }
    if (pathname === '/api/leadership/accounting/stocks' && method === 'POST') {
      return accountingController.createStock(request, env, user);
    }
    if (pathname.match(/^\/api\/leadership\/accounting\/stocks\/\d+$/) && method === 'PUT') {
      return accountingController.updateStock(request, env, user);
    }
    if (pathname.match(/^\/api\/leadership\/accounting\/stocks\/\d+$/) && method === 'DELETE') {
      return accountingController.deleteStock(request, env);
    }
    if (pathname.match(/^\/api\/leadership\/accounting\/stocks\/\d+\/collect$/) && method === 'POST') {
      return accountingController.logCollection(request, env, user);
    }
    if (pathname.match(/^\/api\/leadership\/accounting\/collections\/\d+$/) && method === 'DELETE') {
      return accountingController.deleteCollection(request, env);
    }

    // Item prices map
    if (pathname === '/api/leadership/item-prices' && method === 'GET') {
      return armoryController.getItemPrices(request, env, user);
    }
    // Company profits
    if (pathname === '/api/leadership/accounting/companies' && method === 'GET') {
      return companyProfitController.getCompanyProfits(request, env, user);
    }
    if (pathname === '/api/leadership/accounting/companies' && method === 'POST') {
      return companyProfitController.addCompany(request, env, user, ctx);
    }
    if (pathname.match(/^\/api\/leadership\/accounting\/companies\/\d+\/principal-paid$/) && method === 'POST') {
      return companyProfitController.setPrincipalPaid(request, env, user);
    }
    if (pathname.match(/^\/api\/leadership\/accounting\/companies\/\d+\/breakdown$/) && method === 'GET') {
      return companyProfitController.getCompanyBreakdown(request, env, user);
    }
    if (pathname === '/api/leadership/accounting/companies/history' && method === 'GET') {
      return companyProfitController.getCompanyMonthHistory(request, env, user);
    }
    if (pathname.match(/^\/api\/leadership\/accounting\/companies\/\d+\/month-paid$/) && method === 'POST') {
      return companyProfitController.setCompanyMonthPaid(request, env, user);
    }

    // Armory cache + minimums (read-only for inventory highlights)
    if (pathname === '/api/leadership/armory' && method === 'GET') {
      return armoryController.getArmory(request, env, user);
    }
    if (pathname === '/api/leadership/armory/deposits' && method === 'GET') {
      return armoryController.getArmoryDeposits(request, env, user);
    }
    if (pathname === '/api/leadership/armory/minimums' && method === 'GET') {
      return armoryController.getArmoryMinimums(request, env, user);
    }

    // Organized Crime tracking + team builder
    if (pathname === '/api/leadership/oc/crimes' && method === 'GET') {
      return ocController.getCrimes(request, env, user);
    }
    if (pathname === '/api/leadership/oc/templates' && method === 'GET') {
      return ocController.getCrimeTemplates(request, env, user);
    }
    if (pathname === '/api/leadership/oc/suggest-teams' && method === 'POST') {
      return ocController.suggestTeams(request, env, user);
    }
    if (pathname === '/api/leadership/oc/suggest-teams-batch' && method === 'POST') {
      return ocController.suggestTeamsBatch(request, env, user);
    }
    if (pathname === '/api/leadership/oc/roster' && method === 'GET') {
      return ocController.getCrimeRoster(request, env, user);
    }
    if (pathname === '/api/leadership/oc/cpr-curves' && method === 'GET') {
      return ocController.getCprCurves(request, env, user);
    }
    if (pathname === '/api/leadership/oc/predict-success' && method === 'POST') {
      return ocController.predictSuccess(request, env, user);
    }
    if (pathname === '/api/leadership/oc/weights' && method === 'GET') {
      return ocController.getPositionWeightsConfig(request, env, user);
    }
    if (pathname === '/api/leadership/oc/weights' && method === 'POST') {
      return ocController.updatePositionWeightsConfig(request, env, user);
    }

    // Activity tracking
    if (pathname === '/api/leadership/energy' && method === 'GET') {
      return activityController.getEnergyActivity(request, env);
    }
    if (pathname === '/api/leadership/personal-stats' && method === 'GET') {
      return activityController.getPersonalStats(request, env);
    }
    if (pathname === '/api/leadership/personal-stats/compare' && method === 'GET') {
      return activityController.getPersonalStatsCompare(request, env);
    }
    if (pathname === '/api/leadership/personal-stats/gaps' && method === 'GET') {
      return activityController.getPersonalStatsGaps(request, env);
    }
    if (pathname === '/api/leadership/personal-stats/backfill' && method === 'POST') {
      return activityController.backfillPersonalStats(request, env, user);
    }
    if (pathname === '/api/leadership/personal-stats/snapshot' && method === 'DELETE') {
      return activityController.deletePersonalStatsSnapshot(request, env, user);
    }
  }

  // Discord endpoints
  if (pathname === '/api/discord/callback' && method === 'GET') {
    return discordController.handleCallback(request, env);
  }

  // Bounty-tracking webhook — called by the (external) Discord bot, not a
  // logged-in user, so it authenticates via shared secret instead of a JWT.
  if (pathname === '/api/discord/bounty-webhook' && method === 'POST') {
    return bountyController.handleBountyWebhook(request, env);
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
  if (pathname.match(/^\/api\/game\/rooms\/[A-Z0-9]{6}\/fill-bots$/) && method === 'POST') {
    if (!user) return errorResponse('Authentication required', 401);
    const isAdmin = await requireAdmin(user);
    if (!isAdmin) return errorResponse('Admin access required', 403);
    return gameController.fillBots(request, env, user);
  }
  if (pathname.match(/^\/api\/game\/rooms\/[A-Z0-9]{6}\/inquisitor-messages$/) && method === 'GET') {
    return gameController.getInquisitorMessages(request, env, user);
  }

  // Cards Against Occultus — public + optional auth
  if (pathname === '/api/cards/current' && method === 'GET') {
    return cahController.getCurrentRoom(request, env);
  }
  if (pathname === '/api/cards/current/join' && method === 'POST') {
    return cahController.joinOrCreate(request, env, user);
  }
  if (pathname.match(/^\/api\/cards\/rooms\/[A-Z0-9]{6}$/) && method === 'GET') {
    return cahController.getRoom(request, env, user);
  }
  if (pathname.match(/^\/api\/cards\/rooms\/[A-Z0-9]{6}\/start$/) && method === 'POST') {
    return cahController.startGame(request, env, user);
  }
  if (pathname.match(/^\/api\/cards\/rooms\/[A-Z0-9]{6}\/submit$/) && method === 'POST') {
    return cahController.submitCard(request, env, user);
  }
  if (pathname.match(/^\/api\/cards\/rooms\/[A-Z0-9]{6}\/judge$/) && method === 'POST') {
    return cahController.judgeWinner(request, env, user);
  }
  if (pathname.match(/^\/api\/cards\/rooms\/[A-Z0-9]{6}\/pact$/) && method === 'POST') {
    return cahController.invokePact(request, env, user);
  }
  if (pathname.match(/^\/api\/cards\/rooms\/[A-Z0-9]{6}\/message$/) && method === 'POST') {
    return cahController.sendMessage(request, env, user);
  }
  if (pathname.match(/^\/api\/cards\/rooms\/[A-Z0-9]{6}\/leave$/) && method === 'POST') {
    return cahController.leaveRoom(request, env, user);
  }
  if (pathname.match(/^\/api\/cards\/rooms\/[A-Z0-9]{6}\/settings$/) && method === 'POST') {
    return cahController.updateSettings(request, env, user);
  }
  if (pathname.match(/^\/api\/cards\/rooms\/[A-Z0-9]{6}\/fill-bots$/) && method === 'POST') {
    if (!user) return errorResponse('Authentication required', 401);
    const isAdmin = await requireAdmin(user);
    if (!isAdmin) return errorResponse('Admin access required', 403);
    return cahController.fillBots(request, env, user);
  }

  // Cards admin (admin-gated)
  if (pathname.startsWith('/api/admin/cards')) {
    if (!user) return errorResponse('Authentication required', 401);
    const isAdmin = await requireAdmin(user);
    if (!isAdmin) return errorResponse('Admin access required', 403);

    if (pathname === '/api/admin/cards' && method === 'GET') {
      return cahController.adminGetCards(request, env);
    }
    if (pathname === '/api/admin/cards' && method === 'POST') {
      return cahController.adminCreateCard(request, env, user);
    }
    if (pathname.match(/^\/api\/admin\/cards\/(shadow|fate)\/\d+$/) && method === 'PUT') {
      return cahController.adminUpdateCard(request, env);
    }
    if (pathname.match(/^\/api\/admin\/cards\/(shadow|fate)\/\d+\/toggle$/) && method === 'POST') {
      return cahController.adminToggleCard(request, env);
    }
    if (pathname.match(/^\/api\/admin\/cards\/(shadow|fate)\/\d+$/) && method === 'DELETE') {
      return cahController.adminDeleteCard(request, env);
    }
  }

  // Refresh stock history — leadership only
  if (pathname === '/api/leadership/stocks/refresh' && method === 'POST') {
    if (!(await requireLeadership(user, env))) return errorResponse('Leadership access required', 403);
    return stocksController.refreshStockHistory(request, env);
  }

  // Torn Stock Market — member-auth required
  if (pathname === '/api/stocks' && method === 'GET') {
    if (!user) return errorResponse('Authentication required', 401);
    return stocksController.getStocksList(request, env);
  }
  if (pathname.match(/^\/api\/stocks\/\d+$/) && method === 'GET') {
    if (!user) return errorResponse('Authentication required', 401);
    return stocksController.getStockDetail(request, env);
  }

  // The Binding — familiar game (auth required)
  if (pathname === '/api/binding/familiar' && method === 'GET') {
    if (!user) return errorResponse('Authentication required', 401);
    return bindingController.getFamiliar(request, env, user);
  }
  if (pathname === '/api/binding/create' && method === 'POST') {
    if (!user) return errorResponse('Authentication required', 401);
    return bindingController.createFamiliar(request, env, user);
  }
  if (pathname === '/api/binding/train' && method === 'POST') {
    if (!user) return errorResponse('Authentication required', 401);
    return bindingController.trainFamiliar(request, env, user);
  }
  if (pathname === '/api/binding/hunt' && method === 'POST') {
    if (!user) return errorResponse('Authentication required', 401);
    return bindingController.huntFamiliar(request, env, user);
  }
  if (pathname === '/api/binding/rest' && method === 'POST') {
    if (!user) return errorResponse('Authentication required', 401);
    return bindingController.restFamiliar(request, env, user);
  }
  if (pathname === '/api/binding/duel' && method === 'POST') {
    if (!user) return errorResponse('Authentication required', 401);
    return bindingController.duelFamiliar(request, env, user);
  }
  if (pathname === '/api/binding/allocate' && method === 'POST') {
    if (!user) return errorResponse('Authentication required', 401);
    return bindingController.allocateStat(request, env, user);
  }
  if (pathname.match(/^\/api\/binding\/events\/\d+\/seen$/) && method === 'POST') {
    if (!user) return errorResponse('Authentication required', 401);
    return bindingController.markEventSeen(request, env, user);
  }
  if (pathname === '/api/binding/leaderboard' && method === 'GET') {
    if (!user) return errorResponse('Authentication required', 401);
    return bindingController.getLeaderboard(request, env, user);
  }
  if (pathname === '/api/binding/others' && method === 'GET') {
    if (!user) return errorResponse('Authentication required', 401);
    return bindingController.getOtherFamiliars(request, env, user);
  }
  if (pathname === '/api/binding/battles' && method === 'GET') {
    if (!user) return errorResponse('Authentication required', 401);
    return bindingController.getRecentBattles(request, env, user);
  }
  if (pathname === '/api/binding/revive' && method === 'POST') {
    if (!user) return errorResponse('Authentication required', 401);
    return bindingController.reviveFamiliar(request, env, user);
  }
  if (pathname === '/api/binding/rename' && method === 'POST') {
    if (!user) return errorResponse('Authentication required', 401);
    return bindingController.renameFamiliar(request, env, user);
  }
  if (pathname === '/api/binding/shop' && method === 'GET') {
    if (!user) return errorResponse('Authentication required', 401);
    return bindingController.getShopItems(request, env, user);
  }
  if (pathname === '/api/binding/shop/buy' && method === 'POST') {
    if (!user) return errorResponse('Authentication required', 401);
    return bindingController.shopBuy(request, env, user);
  }

  // The Sanctum — idle RPG (auth required)
  if (pathname === '/api/sanctum/state' && method === 'GET') {
    if (!user) return errorResponse('Authentication required', 401);
    return sanctumController.getState(request, env, user);
  }
  if (pathname === '/api/sanctum/click' && method === 'POST') {
    if (!user) return errorResponse('Authentication required', 401);
    return sanctumController.click(request, env, user);
  }
  if (pathname === '/api/sanctum/upgrade' && method === 'POST') {
    if (!user) return errorResponse('Authentication required', 401);
    return sanctumController.buyUpgrade(request, env, user);
  }
  if (pathname === '/api/sanctum/sync' && method === 'POST') {
    if (!user) return errorResponse('Authentication required', 401);
    return sanctumController.sync(request, env, user);
  }
  if (pathname === '/api/sanctum/leaderboard' && method === 'GET') {
    return sanctumController.getLeaderboard(request, env);
  }

  // The Pact — occult 18-night ritual/business-sim (auth required)
  {
    const S = /^\/api\/pact\/session\/[A-Za-z0-9]{6}/;
    if (pathname === '/api/pact/session' && method === 'POST') {
      if (!user) return errorResponse('Authentication required', 401);
      return pactController.createSession(request, env, user);
    }
    if (pathname === '/api/pact/leaderboard' && method === 'GET') {
      if (!user) return errorResponse('Authentication required', 401);
      return pactController.leaderboard(request, env, user);
    }
    if (S.test(pathname) && (method === 'GET' || method === 'POST')) {
      if (!user) return errorResponse('Authentication required', 401);
      if (pathname.endsWith('/state') && method === 'GET')  return pactController.getState(request, env, user);
      if (pathname.endsWith('/join')  && method === 'POST') return pactController.joinSession(request, env, user);
      if (pathname.endsWith('/team')  && method === 'POST') return pactController.chooseTeam(request, env, user);
      if (pathname.endsWith('/cabal') && method === 'POST') return pactController.setCabalName(request, env, user);
      if (pathname.endsWith('/start') && method === 'POST') return pactController.startSession(request, env, user);
      if (pathname.endsWith('/vote')  && method === 'POST') return pactController.vote(request, env, user);
      if (pathname.endsWith('/rejoin') && method === 'POST') return pactController.rejoin(request, env, user);
    }
  }

  // 404 - Not found
  return errorResponse('Endpoint not found', 404);
}
