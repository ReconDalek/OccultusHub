import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';

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
        COUNT(lh.id) as login_count
      FROM users u
      LEFT JOIN login_history lh ON u.id = lh.user_id
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
    const scope = new URL(request.url).searchParams.get('scope') ?? 'all';

    const apiKey = await getRandomUserApiKey(env);
    if (!apiKey) {
      return errorResponse('No user API keys available for cache refresh', 400);
    }

    const factionIds = [33097, 9171, 9728];
    const companyIds = [112941, 120244, 121745, 122254, 120502, 124650];

    let factionResult = null;
    let companyResult = null;

    if (scope === 'all' || scope === 'factions') {
      factionResult = await fetchAndCacheFactions(env, factionIds, apiKey);
    }
    if (scope === 'all' || scope === 'companies') {
      companyResult = await fetchAndCacheCompanies(env, companyIds, apiKey);
    }

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
