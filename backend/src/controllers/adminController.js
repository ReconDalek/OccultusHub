import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { getKickThresholdCounts } from './activityController.js';

const FACTION_NAMES = { 33097: 'Occultus', 9728: 'Occul2us', 9171: 'Occul3us' };

// Coarse device classification from a raw User-Agent string — no library,
// just enough to split Mobile/Tablet/Desktop for a pie chart. Order matters:
// iPad's UA also contains "Mobile" on newer iOS versions, so Tablet is
// checked first.
function classifyDevice(ua) {
  if (!ua) return 'Unknown';
  if (/iPad|Tablet/i.test(ua)) return 'Tablet';
  if (/Mobi|Android|iPhone/i.test(ua)) return 'Mobile';
  return 'Desktop';
}

export async function getAllUsers(request, env, user) {
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get('search');

    let query = `
      SELECT
        u.id,
        u.torn_user_id,
        u.username,
        u.faction_id,
        u.faction_position,
        u.image_url,
        u.is_admin,
        u.is_owner,
        u.created_at,
        u.last_login,
        u.access_override,
        u.access_override_expires_at,
        u.access_override_note,
        COUNT(lh.id) as login_count,
        json_extract(fc.data, '$.basic.name') as faction_name
      FROM users u
      LEFT JOIN login_history lh ON u.id = lh.user_id
      LEFT JOIN faction_cache fc ON fc.faction_id = u.faction_id
    `;

    let statement;
    if (search) {
      query += ` WHERE u.username LIKE ? GROUP BY u.id ORDER BY u.username`;
      statement = env.DB.prepare(query).bind(`%${search}%`);
    } else {
      query += ` GROUP BY u.id ORDER BY u.created_at DESC`;
      statement = env.DB.prepare(query);
    }

    const result = await statement.all();

    return jsonResponse({
      users: result.results || [],
      total: result.results?.length || 0,
    });
  } catch (error) {
    console.error('getAllUsers error:', error);
    return errorResponse('Failed to fetch users', 500);
  }
}

export async function getUserHistory(request, env, user) {
  try {
    const { tornUserId } = new URL(request.url).pathname.match(
      /\/api\/admin\/users\/(?<tornUserId>\d+)\/history/
    )?.groups ?? {};

    const userResult = await env.DB.prepare(
      'SELECT id FROM users WHERE torn_user_id = ?'
    )
      .bind(tornUserId)
      .first();

    if (!userResult) {
      return errorResponse('User not found', 404);
    }

    const historyResult = await env.DB.prepare(
      `SELECT login_at, ip_address, user_agent
       FROM login_history
       WHERE user_id = ?
       ORDER BY login_at DESC
       LIMIT 50`
    )
      .bind(userResult.id)
      .all();

    return jsonResponse({
      logins: historyResult.results || [],
      total: historyResult.results?.length || 0,
    });
  } catch (error) {
    console.error('getUserHistory error:', error);
    return errorResponse('Failed to fetch user history', 500);
  }
}

export async function grantAdmin(request, env, user) {
  try {
    // Only owner can grant admin access
    if (!user.isOwner) {
      return errorResponse('Only owner can grant admin access', 403);
    }

    const { tornUserId } = new URL(request.url).pathname.match(
      /\/api\/admin\/users\/(?<tornUserId>\d+)\/grant/
    )?.groups ?? {};
    const { reason } = await request.json();

    const userResult = await env.DB.prepare(
      'SELECT id FROM users WHERE torn_user_id = ?'
    )
      .bind(tornUserId)
      .first();

    if (!userResult) {
      return errorResponse('User not found', 404);
    }

    const userId = userResult.id;

    // Update is_admin flag
    await env.DB.prepare('UPDATE users SET is_admin = 1 WHERE id = ?')
      .bind(userId)
      .run();

    // Log the grant
    await env.DB.prepare(
      `INSERT INTO admin_users (user_id, granted_by, reason)
       VALUES (?, ?, ?)`
    )
      .bind(userId, user.userId, reason || null)
      .run();

    return jsonResponse({ message: 'Admin access granted' });
  } catch (error) {
    console.error('grantAdmin error:', error);
    return errorResponse('Failed to grant admin access', 500);
  }
}

export async function revokeAdmin(request, env, user) {
  try {
    // Only owner can revoke admin access
    if (!user.isOwner) {
      return errorResponse('Only owner can revoke admin access', 403);
    }

    const { tornUserId } = new URL(request.url).pathname.match(
      /\/api\/admin\/users\/(?<tornUserId>\d+)\/revoke/
    )?.groups ?? {};
    const { reason } = await request.json();

    const userResult = await env.DB.prepare(
      'SELECT id FROM users WHERE torn_user_id = ?'
    )
      .bind(tornUserId)
      .first();

    if (!userResult) {
      return errorResponse('User not found', 404);
    }

    const userId = userResult.id;

    // Prevent owner from revoking themselves
    if (userId === user.userId) {
      return errorResponse('Cannot revoke your own admin access', 400);
    }

    // Update is_admin flag
    await env.DB.prepare('UPDATE users SET is_admin = 0 WHERE id = ?')
      .bind(userId)
      .run();

    // Log the revoke
    await env.DB.prepare(
      `UPDATE admin_users
       SET revoked_at = CURRENT_TIMESTAMP, revoked_by = ?, reason = ?
       WHERE user_id = ? AND revoked_at IS NULL`
    )
      .bind(user.userId, reason || null, userId)
      .run();

    return jsonResponse({ message: 'Admin access revoked' });
  } catch (error) {
    console.error('revokeAdmin error:', error);
    return errorResponse('Failed to revoke admin access', 500);
  }
}

// Grants/revokes a temporary member or leader access override for a user —
// e.g. a member visiting from another Occultus faction temporarily.
// Never derived from the target's own API key/faction data; purely a manual admin grant.
export async function setAccessOverride(request, env, user) {
  try {
    const { tornUserId } = new URL(request.url).pathname.match(
      /\/api\/admin\/users\/(?<tornUserId>\d+)\/access-override/
    )?.groups ?? {};

    const { level, durationHours, note } = await request.json();

    if (level !== null && level !== 'member' && level !== 'leader') {
      return errorResponse('level must be "member", "leader", or null', 400);
    }

    const userResult = await env.DB.prepare(
      'SELECT id FROM users WHERE torn_user_id = ?'
    )
      .bind(tornUserId)
      .first();

    if (!userResult) {
      return errorResponse('User not found', 404);
    }

    if (level === null) {
      await env.DB.prepare(
        `UPDATE users
         SET access_override = NULL, access_override_expires_at = NULL,
             access_override_note = NULL, access_override_granted_by = NULL,
             access_override_granted_at = NULL
         WHERE id = ?`
      )
        .bind(userResult.id)
        .run();

      return jsonResponse({ message: 'Access override revoked' });
    }

    const expiresAt = durationHours
      ? new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ')
      : null;

    await env.DB.prepare(
      `UPDATE users
       SET access_override = ?, access_override_expires_at = ?, access_override_note = ?,
           access_override_granted_by = ?, access_override_granted_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
      .bind(level, expiresAt, note || null, user.userId, userResult.id)
      .run();

    return jsonResponse({ message: `${level === 'leader' ? 'Leader' : 'Member'} access granted`, expiresAt });
  } catch (error) {
    console.error('setAccessOverride error:', error);
    return errorResponse('Failed to update access override', 500);
  }
}

export async function getPages(request, env, user) {
  try {
    const result = await env.DB.prepare(
      'SELECT page_name, is_visible FROM page_settings'
    ).all();

    const pages = {};
    result.results?.forEach((row) => {
      pages[row.page_name] = row.is_visible === 1;
    });

    return jsonResponse(pages);
  } catch (error) {
    console.error('getPages error:', error);
    return errorResponse('Failed to fetch pages', 500);
  }
}

export async function togglePage(request, env, user) {
  try {
    const pageName = new URL(request.url).pathname.split('/')[4];

    const result = await env.DB.prepare(
      `UPDATE page_settings
       SET is_visible = 1 - is_visible, updated_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE page_name = ?
       RETURNING page_name, is_visible`
    )
      .bind(user.userId, pageName)
      .first();

    if (!result) {
      return errorResponse('Page not found', 404);
    }

    return jsonResponse({
      page: result.page_name,
      isVisible: result.is_visible === 1,
    });
  } catch (error) {
    console.error('togglePage error:', error);
    return errorResponse('Failed to toggle page visibility', 500);
  }
}

export async function getCacheStatus(request, env, user) {
  try {
    const [factionsResult, companiesResult] = await Promise.all([
      env.DB.prepare(
        `SELECT COUNT(*) as count, MAX(fetched_at) as last_updated FROM faction_cache`
      ).first(),
      env.DB.prepare(
        `SELECT COUNT(*) as count, MAX(fetched_at) as last_updated FROM company_cache`
      ).first(),
    ]);

    return jsonResponse({
      factions: {
        count: factionsResult?.count ?? 0,
        lastUpdated: factionsResult?.last_updated ?? null,
      },
      companies: {
        count: companiesResult?.count ?? 0,
        lastUpdated: companiesResult?.last_updated ?? null,
      },
    });
  } catch (error) {
    console.error('getCacheStatus error:', error);
    return errorResponse('Failed to fetch cache status', 500);
  }
}

export async function refreshCache(request, env, user) {
  try {
    const { fetchAndCacheFactions, fetchAndCacheCompanies, getRandomUserApiKey } = await import('../services/tornApiService.js');
    const { logInfo, logError } = await import('../services/logger.js');
    const scope = new URL(request.url).searchParams.get('scope') ?? 'all';

    const apiKeyObj = await getRandomUserApiKey(env);
    if (!apiKeyObj?.key) {
      await logError(env, { category: 'api_error', event: 'cache_refresh_no_key', message: 'Manual cache refresh failed: no API key available', meta: { scope, triggeredBy: user?.username } });
      return errorResponse('No user API keys available for cache refresh', 400);
    }

    const factionIds = [33097, 9171, 9728];
    const trigger = 'manual';

    let factionResult = null;
    let companyResult = null;

    if (scope === 'all' || scope === 'factions') {
      factionResult = await fetchAndCacheFactions(env, factionIds, apiKeyObj, trigger);
    }
    if (scope === 'all' || scope === 'companies') {
      // Read the canonical company list from company_config rather than a
      // hardcoded array, so newly-added companies (Accounting > Companies)
      // are picked up by a manual refresh too, not just the daily cron.
      const { results: configRows } = await env.DB.prepare(`SELECT company_id FROM company_config`).all();
      const companyIds = (configRows || []).map(r => r.company_id);
      companyResult = companyIds.length
        ? await fetchAndCacheCompanies(env, companyIds, apiKeyObj, trigger)
        : { fetched: 0, errors: 0 };
    }

    await logInfo(env, {
      category: 'admin', event: 'cache_refresh',
      message: `Manual cache refresh (${scope}) by ${user?.username ?? 'unknown'}`,
      torn_user_id: user?.tornUserId, username: user?.username,
      meta: { scope, factions: factionResult, companies: companyResult },
    });

    return jsonResponse({
      message: `Cache refresh completed (${scope})`,
      factions: factionResult,
      companies: companyResult,
      refreshedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('refreshCache error:', error);
    return errorResponse('Failed to refresh cache', 500);
  }
}

export async function getAnalytics(request, env, user) {
  try {
    const totalUsersResult = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM users'
    ).first();
    const totalAdminsResult = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM users WHERE is_admin = 1'
    ).first();
    const totalLoginsResult = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM login_history'
    ).first();
    const lastWeekLoginsResult = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM login_history
       WHERE login_at > datetime('now', '-7 days')`
    ).first();

    return jsonResponse({
      totalUsers: totalUsersResult?.count || 0,
      totalAdmins: totalAdminsResult?.count || 0,
      totalLogins: totalLoginsResult?.count || 0,
      loginsLastWeek: lastWeekLoginsResult?.count || 0,
    });
  } catch (error) {
    console.error('getAnalytics error:', error);
    return errorResponse('Failed to fetch analytics', 500);
  }
}

// ── Full Analytics dashboard (Admin > Analytics tab) ────────────────────────
// A much broader survey than getAnalytics above (kept as-is for backward
// compatibility, though the new Analytics tab replaces its old home at the
// top of the Cache page) — growth, activity trends, feature engagement
// across the site's many mini-features, and a moderation/health snapshot.
// Every section is its own query (or small group), run in parallel — none of
// this needs to be fast-refreshing so a handful of extra COUNT(*) queries on
// an admin-only page is a non-issue.
export async function getAnalyticsDashboard(request, env, user) {
  try {
    const [
      totalsRow,
      signupsByDayRows,
      factionRows,
      activeBucketsRow,
      loginsByDayRows,
      uniqueActiveByDayRows,
      deviceRows,
      forumsRow,
      forumsAuthorsRow,
      riteRow,
      cahRow,
      pactRow,
      sanctumRow,
      bindingRow,
      cipherRow,
      cipherSolversRow,
      cipherMonthRow,
      discordRow,
      fishingRow,
      fishingUsersRow,
      runeRow,
      runeUsersRow,
      warningsMonthRow,
      webhookRows,
    ] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) AS count FROM users`).first(),
      env.DB.prepare(`SELECT date(created_at) AS day, COUNT(*) AS count FROM users WHERE created_at >= datetime('now','-30 days') GROUP BY day ORDER BY day ASC`).all(),
      env.DB.prepare(`SELECT faction_id, COUNT(*) AS count FROM users GROUP BY faction_id`).all(),
      env.DB.prepare(`
        SELECT
          SUM(CASE WHEN last_login >= datetime('now','-1 day')  THEN 1 ELSE 0 END) AS last24h,
          SUM(CASE WHEN last_login >= datetime('now','-7 days') THEN 1 ELSE 0 END) AS last7d,
          SUM(CASE WHEN last_login >= datetime('now','-30 days') THEN 1 ELSE 0 END) AS last30d,
          SUM(CASE WHEN last_login >= datetime('now','-90 days') THEN 1 ELSE 0 END) AS last90d,
          SUM(CASE WHEN last_login IS NULL THEN 1 ELSE 0 END) AS never
        FROM users
      `).first(),
      env.DB.prepare(`SELECT date(login_at) AS day, COUNT(*) AS count FROM login_history WHERE login_at >= datetime('now','-30 days') GROUP BY day ORDER BY day ASC`).all(),
      env.DB.prepare(`SELECT date(login_at) AS day, COUNT(DISTINCT user_id) AS count FROM login_history WHERE login_at >= datetime('now','-30 days') GROUP BY day ORDER BY day ASC`).all(),
      env.DB.prepare(`SELECT user_agent FROM login_history WHERE login_at >= datetime('now','-30 days')`).all(),
      env.DB.prepare(`SELECT COUNT(*) AS count FROM forum_posts`).first(),
      env.DB.prepare(`SELECT COUNT(DISTINCT author_id) AS count FROM forum_posts WHERE created_at >= datetime('now','-30 days')`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS count FROM game_rooms`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS count FROM cah_rooms`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS count FROM pact_sessions`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS count FROM sanctum_saves`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS count FROM familiars`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS count FROM cipher_submissions`).first(),
      env.DB.prepare(`SELECT COUNT(DISTINCT user_id) AS count FROM cipher_submissions WHERE is_correct = 1 AND user_id IS NOT NULL`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS count FROM cipher_submissions WHERE submitted_at >= datetime('now','-30 days')`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS count FROM discord_links`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS count FROM fishing_catches`).first(),
      env.DB.prepare(`SELECT COUNT(DISTINCT user_id) AS count FROM fishing_catches`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS count FROM rune_casts`).first(),
      env.DB.prepare(`SELECT COUNT(DISTINCT user_id) AS count FROM rune_casts`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS count FROM member_warnings WHERE date_reported >= date('now','-30 days')`).first(),
      env.DB.prepare(`SELECT event_type, enabled, last_status, last_triggered FROM webhook_configs`).all(),
    ]);

    // Device breakdown parsed in JS — SQLite has no regex function to lean on.
    const deviceCounts = {};
    for (const row of (deviceRows.results || [])) {
      const device = classifyDevice(row.user_agent);
      deviceCounts[device] = (deviceCounts[device] || 0) + 1;
    }

    // "at or over the kick threshold right now" — same trailing-6-complete-
    // months window Generate Warnings/WarningsTab both use (see
    // [[generate_warnings_feature]]), reused rather than reimplemented.
    const kickCounts = await getKickThresholdCounts(env);
    const membersAtKickThreshold = Object.values(kickCounts).filter(c => c >= 3).length;

    const factionDistribution = (factionRows.results || []).map(r => ({
      faction_id: r.faction_id,
      faction_name: r.faction_id ? (FACTION_NAMES[r.faction_id] ?? `Faction ${r.faction_id}`) : 'No faction / guest',
      count: r.count,
    })).sort((a, b) => b.count - a.count);

    const totalUsers = totalsRow?.count || 0;
    const linkedDiscord = discordRow?.count || 0;

    return jsonResponse({
      growth: {
        total_users: totalUsers,
        signups_by_day: signupsByDayRows.results || [],
        faction_distribution: factionDistribution,
        active_buckets: {
          last_24h: activeBucketsRow?.last24h || 0,
          last_7d:  activeBucketsRow?.last7d  || 0,
          last_30d: activeBucketsRow?.last30d || 0,
          last_90d: activeBucketsRow?.last90d || 0,
          never:    activeBucketsRow?.never   || 0,
          total:    totalUsers,
        },
      },
      activity: {
        logins_by_day: loginsByDayRows.results || [],
        unique_active_by_day: uniqueActiveByDayRows.results || [],
        device_breakdown: Object.entries(deviceCounts).map(([device, count]) => ({ device, count })).sort((a, b) => b.count - a.count),
      },
      engagement: {
        forums: { total_posts: forumsRow?.count || 0, active_authors_month: forumsAuthorsRow?.count || 0 },
        games: {
          rite_rooms:      riteRow?.count    || 0,
          cah_rooms:       cahRow?.count     || 0,
          pact_sessions:   pactRow?.count    || 0,
          sanctum_players: sanctumRow?.count || 0,
          binding_players: bindingRow?.count || 0,
        },
        cipher: {
          total_submissions:    cipherRow?.count        || 0,
          unique_solvers:       cipherSolversRow?.count  || 0,
          submissions_month:    cipherMonthRow?.count    || 0,
        },
        discord: { linked: linkedDiscord, total_users: totalUsers, pct: totalUsers ? Math.round((linkedDiscord / totalUsers) * 100) : 0 },
        easter_eggs: {
          fishing_catches:  fishingRow?.count      || 0,
          fishing_users:    fishingUsersRow?.count || 0,
          rune_casts:       runeRow?.count         || 0,
          rune_users:       runeUsersRow?.count    || 0,
        },
      },
      moderation: {
        warnings_issued_month: warningsMonthRow?.count || 0,
        members_at_kick_threshold: membersAtKickThreshold,
        webhooks: webhookRows.results || [],
      },
    });
  } catch (error) {
    console.error('getAnalyticsDashboard error:', error);
    return errorResponse('Failed to fetch analytics dashboard', 500);
  }
}

export async function getSettings(request, env, user) {
  try {
    const result = await env.DB.prepare(
      'SELECT key, value FROM system_settings'
    ).all();

    const settings = {};
    result.results?.forEach((row) => {
      settings[row.key] = row.value;
    });

    return jsonResponse(settings);
  } catch (error) {
    console.error('getSettings error:', error);
    return errorResponse('Failed to fetch settings', 500);
  }
}

export async function getPublicSettings(request, env) {
  try {
    const PUBLIC_KEYS = [
      'site_title', 'fishing_enabled', 'runes_enabled',
      'event_blood_moon', 'event_new_year', 'event_valentines', 'event_st_patricks',
      'event_walpurgis', 'event_summer_solstice', 'event_halloween', 'event_day_of_dead',
      'event_winter_solstice', 'event_yuletide',
    ];
    const result = await env.DB.prepare(
      `SELECT key, value FROM system_settings WHERE key IN (${PUBLIC_KEYS.map(() => '?').join(',')})`
    ).bind(...PUBLIC_KEYS).all();

    const settings = {};
    result.results?.forEach((row) => {
      settings[row.key] = row.value;
    });

    return jsonResponse(settings);
  } catch (error) {
    console.error('getPublicSettings error:', error);
    return errorResponse('Failed to fetch public settings', 500);
  }
}

export async function updateSetting(request, env, user) {
  try {
    const match = new URL(request.url).pathname.match(
      /\/api\/admin\/settings\/([^/]+)/
    );
    const key = match?.[1];

    const { value } = await request.json();

    if (!key || value === undefined) {
      return errorResponse('Key and value are required', 400);
    }

    const result = await env.DB.prepare(
      `UPDATE system_settings
       SET value = ?, updated_at = CURRENT_TIMESTAMP
       WHERE key = ?
       RETURNING key, value`
    )
      .bind(value, key)
      .first();

    if (!result) {
      return errorResponse('Setting not found', 404);
    }

    return jsonResponse(result);
  } catch (error) {
    console.error('updateSetting error:', error);
    return errorResponse('Failed to update setting', 500);
  }
}
