import { generateToken } from '../middleware/auth.js';
import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';

const TORN_API_URL = 'https://api.torn.com';

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
        `${TORN_API_URL}/user?selections=profile&key=${apiKey}`
      );
      if (!response.ok) {
        return errorResponse('Invalid API key', 401);
      }
      tornUser = await response.json();
    } catch {
      return errorResponse('Invalid API key', 401);
    }

    // Check if user exists in database
    const existingUser = await env.DB.prepare(
      'SELECT * FROM users WHERE torn_user_id = ?'
    )
      .bind(tornUser.user_id)
      .first();

    let user;
    if (existingUser) {
      user = existingUser;
      // Update last login
      await env.DB.prepare(
        'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?'
      )
        .bind(user.id)
        .run();
    } else {
      // Create new user
      const result = await env.DB.prepare(
        `INSERT INTO users (torn_user_id, username, faction_id, faction_position, image_url)
         VALUES (?, ?, ?, ?, ?)
         RETURNING *`
      )
        .bind(
          tornUser.user_id ?? null,
          tornUser.name ?? null,
          tornUser.faction?.faction_id ?? null,
          tornUser.job?.position ?? null,
          tornUser.image ?? null
        )
        .first();

      if (!result) {
        return errorResponse('Failed to create user', 500);
      }
      user = result;
    }

    // Log login
    const ipAddress = request.headers.get('cf-connecting-ip') || '';
    const userAgent = request.headers.get('user-agent') || '';
    await env.DB.prepare(
      'INSERT INTO login_history (user_id, ip_address, user_agent) VALUES (?, ?, ?)'
    )
      .bind(user.id, ipAddress, userAgent)
      .run();

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
