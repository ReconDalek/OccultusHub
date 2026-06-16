import { generateToken } from '../middleware/auth.js';
import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { logInfo, logWarn, logError } from '../services/logger.js';

const TORN_API_BASE = 'https://api.torn.com/v2';

export async function login(request, env) {
  try {
    const { apiKey } = await request.json();

    if (!apiKey) {
      return errorResponse('API key is required', 400);
    }

    // Validate API key with Torn.com
    let tornUser;
    try {
      const response = await fetch(
        `${TORN_API_BASE}/user?selections=profile&comment=OccHub`,
        { headers: { Authorization: `ApiKey ${apiKey}` } }
      );
      if (!response.ok) {
        return errorResponse('Invalid API key', 401);
      }
      tornUser = await response.json();
    } catch (err) {
      console.error('Torn API error:', err);
      await logError(env, { category: 'api_error', event: 'torn_auth_failed', message: `Torn API auth failed: ${err.message}` });
      return errorResponse('Invalid API key', 401);
    }

    // Fetch user's calendar start time preference (non-blocking)
    let calendarStartTime = null;
    try {
      const calRes = await fetch(
        `${TORN_API_BASE}/user/calendar?comment=OccHub`,
        { headers: { Authorization: `ApiKey ${apiKey}` } }
      );
      if (calRes.ok) {
        const calData = await calRes.json();
        const raw = calData?.calendar?.start_time ?? null;
        if (raw) {
          // Normalise "10:00 TCT" → "10:00"
          calendarStartTime = raw.replace(/\s*TCT$/i, '').trim();
        }
      }
    } catch (e) {
      console.warn('Could not fetch user calendar start time:', e);
    }

    console.log('Torn user data:', JSON.stringify(tornUser));

    // Encrypt API key (base64 encoding)
    const encryptedApiKey = btoa(apiKey);

    // Check if user exists in database
    const existingUser = await env.DB.prepare(
      'SELECT * FROM users WHERE torn_user_id = ?'
    )
      .bind(tornUser.player_id ?? null)
      .first();

    let user;
    if (existingUser) {
      user = existingUser;
      // Update user details if they've changed, plus update last_login and api_key
      await env.DB.prepare(
        `UPDATE users
         SET username = ?,
             faction_id = ?,
             faction_position = ?,
             image_url = ?,
             api_key = ?,
             calendar_start_time = COALESCE(?, calendar_start_time),
             last_login = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
        .bind(
          tornUser.name ?? user.username,
          tornUser.faction?.faction_id ?? user.faction_id,
          tornUser.faction?.position ?? user.faction_position,
          tornUser.profile_image ?? user.image_url,
          encryptedApiKey,
          calendarStartTime,
          user.id
        )
        .run();
      // Fetch updated user
      user = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
        .bind(user.id)
        .first();
    } else {
      // Create new user
      console.log('Creating new user with:', {
        torn_user_id: tornUser.player_id ?? null,
        username: tornUser.name ?? null,
        faction_id: tornUser.faction?.faction_id ?? null,
        faction_position: tornUser.faction?.position ?? null,
        image_url: tornUser.profile_image ?? null,
      });

      const result = await env.DB.prepare(
        `INSERT INTO users (torn_user_id, username, faction_id, faction_position, image_url, api_key, calendar_start_time)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         RETURNING *`
      )
        .bind(
          tornUser.player_id ?? null,
          tornUser.name ?? null,
          tornUser.faction?.faction_id ?? null,
          tornUser.faction?.position ?? null,
          tornUser.profile_image ?? null,
          encryptedApiKey,
          calendarStartTime
        )
        .first();

      console.log('Insert result:', JSON.stringify(result));

      if (!result) {
        return errorResponse('Failed to create user', 500);
      }
      user = result;
    }

    console.log('User object before login history:', JSON.stringify(user));

    // Log login
    const ipAddress = request.headers.get('cf-connecting-ip') ?? '';
    const userAgent = request.headers.get('user-agent') ?? '';

    console.log('Logging login with:', {
      user_id: user.id,
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    await env.DB.prepare(
      'INSERT INTO login_history (user_id, ip_address, user_agent) VALUES (?, ?, ?)'
    )
      .bind(user.id ?? null, ipAddress, userAgent)
      .run();

    await logInfo(env, {
      category: 'auth', event: 'login',
      message: `${user.username} logged in`,
      torn_user_id: user.torn_user_id, username: user.username, faction_id: user.faction_id,
      meta: { ip: request.headers.get('cf-connecting-ip'), isNew: !existingUser },
    });

    // Generate JWT token
    const token = await generateToken(user, env);

    return jsonResponse({
      token,
      user: {
        userId: user.id,
        tornUserId: user.torn_user_id,
        username: user.username,
        factionId: user.faction_id,
        factionPosition: user.faction_position,
        image: user.image_url,
        isAdmin: user.is_admin === 1,
        isOwner: user.is_owner === 1,
        fishingPoints: user.fishing_points || 0,
        runePoints: user.rune_points || 0,
        calendarStartTime: user.calendar_start_time || null,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function session(request, env, user) {
  try {
    if (!user) {
      return errorResponse('No token provided', 401);
    }

    const userData = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
      .bind(user.userId)
      .first();

    if (!userData) {
      return jsonResponse({ valid: false });
    }

    return jsonResponse({
      valid: true,
      user: {
        userId: userData.id,
        tornUserId: userData.torn_user_id,
        username: userData.username,
        factionId: userData.faction_id,
        factionPosition: userData.faction_position,
        image: userData.image_url,
        isAdmin: userData.is_admin === 1,
        isOwner: userData.is_owner === 1,
        fishingPoints: userData.fishing_points || 0,
        lastFishedAt: userData.last_fished_at || null,
        runePoints: userData.rune_points || 0,
        lastRuneCastAt: userData.last_rune_cast_at || null,
        calendarStartTime: userData.calendar_start_time || null,
      },
    });
  } catch (error) {
    console.error('Session error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function logout(request, env, user) {
  return jsonResponse({ message: 'Logged out successfully' });
}
