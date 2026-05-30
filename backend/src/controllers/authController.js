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
    } catch (err) {
      console.error('Torn API error:', err);
      return errorResponse('Invalid API key', 401);
    }

    console.log('Torn user data:', JSON.stringify(tornUser));

    // Check if user exists in database
    const existingUser = await env.DB.prepare(
      'SELECT * FROM users WHERE torn_user_id = ?'
    )
      .bind(tornUser.player_id ?? null)
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
      console.log('Creating new user with:', {
        torn_user_id: tornUser.player_id ?? null,
        username: tornUser.name ?? null,
        faction_id: tornUser.faction?.faction_id ?? null,
        faction_position: tornUser.faction?.position ?? null,
        image_url: tornUser.profile_image ?? null,
      });

      const result = await env.DB.prepare(
        `INSERT INTO users (torn_user_id, username, faction_id, faction_position, image_url)
         VALUES (?, ?, ?, ?, ?)
         RETURNING *`
      )
        .bind(
          tornUser.player_id ?? null,
          tornUser.name ?? null,
          tornUser.faction?.faction_id ?? null,
          tornUser.faction?.position ?? null,
          tornUser.profile_image ?? null
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
