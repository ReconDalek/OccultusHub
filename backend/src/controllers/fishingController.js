import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';

const COOLDOWN_HOURS = 12;

function getCooldownStatus(lastFishedAt) {
  if (!lastFishedAt) return { canFish: true, nextCastAt: null, msRemaining: 0 };
  const last = new Date(lastFishedAt.replace(' ', 'T') + 'Z');
  const nextCast = new Date(last.getTime() + COOLDOWN_HOURS * 60 * 60 * 1000);
  const now = Date.now();
  if (now >= nextCast.getTime()) return { canFish: true, nextCastAt: null, msRemaining: 0 };
  return { canFish: false, nextCastAt: nextCast.toISOString(), msRemaining: nextCast.getTime() - now };
}

export async function startCast(request, env, user) {
  try {
    if (!user) return errorResponse('Authentication required', 401);

    const userData = await env.DB.prepare(
      'SELECT last_fished_at FROM users WHERE id = ?'
    ).bind(user.userId).first();

    const status = getCooldownStatus(userData?.last_fished_at);

    if (!status.canFish) {
      return jsonResponse({ ok: false, nextCastAt: status.nextCastAt, msRemaining: status.msRemaining }, 429);
    }

    await env.DB.prepare(
      'UPDATE users SET last_fished_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(user.userId).run();

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error('startCast error:', error);
    return errorResponse('Failed to start cast', 500);
  }
}

export async function getLeaderboard(request, env) {
  try {
    const result = await env.DB.prepare(`
      SELECT u.torn_user_id, u.username, u.image_url, u.faction_id, u.fishing_points,
             COUNT(fc.id) as total_catches
      FROM users u
      LEFT JOIN fishing_catches fc ON u.id = fc.user_id
      WHERE u.fishing_points > 0
      GROUP BY u.id
      ORDER BY u.fishing_points DESC
      LIMIT 50
    `).all();

    return jsonResponse({ leaderboard: result.results || [] });
  } catch (error) {
    console.error('getLeaderboard error:', error);
    return errorResponse('Failed to fetch leaderboard', 500);
  }
}

export async function recordCatch(request, env, user) {
  try {
    if (!user) return errorResponse('Authentication required', 401);

    const { fishName, fishRarity, points } = await request.json();

    if (!fishName || !fishRarity || typeof points !== 'number' || points <= 0) {
      return errorResponse('Invalid catch data', 400);
    }

    const validRarities = ['common', 'uncommon', 'rare', 'legendary'];
    if (!validRarities.includes(fishRarity)) {
      return errorResponse('Invalid rarity', 400);
    }

    // Secondary cooldown check — last_fished_at must have been set within the last 12h + 5min window
    const userData = await env.DB.prepare(
      'SELECT last_fished_at FROM users WHERE id = ?'
    ).bind(user.userId).first();

    if (!userData?.last_fished_at) {
      return errorResponse('No active cast session', 403);
    }

    const castAt = new Date(userData.last_fished_at.replace(' ', 'T') + 'Z');
    const sessionWindow = 20 * 60 * 1000; // 20 minutes max for a fishing session
    if (Date.now() - castAt.getTime() > sessionWindow) {
      return errorResponse('Cast session expired', 403);
    }

    await env.DB.prepare(
      'INSERT INTO fishing_catches (user_id, fish_name, fish_rarity, points) VALUES (?, ?, ?, ?)'
    ).bind(user.userId, fishName, fishRarity, points).run();

    await env.DB.prepare(
      'UPDATE users SET fishing_points = COALESCE(fishing_points, 0) + ? WHERE id = ?'
    ).bind(points, user.userId).run();

    const updated = await env.DB.prepare(
      'SELECT fishing_points FROM users WHERE id = ?'
    ).bind(user.userId).first();

    return jsonResponse({ success: true, totalPoints: updated?.fishing_points || 0 });
  } catch (error) {
    console.error('recordCatch error:', error);
    return errorResponse('Failed to record catch', 500);
  }
}

export async function resetLeaderboard(request, env, user) {
  try {
    await env.DB.prepare('UPDATE users SET fishing_points = 0, last_fished_at = NULL').run();
    await env.DB.prepare('DELETE FROM fishing_catches').run();
    return jsonResponse({ success: true, message: 'Fishing leaderboard reset' });
  } catch (error) {
    console.error('resetLeaderboard error:', error);
    return errorResponse('Failed to reset leaderboard', 500);
  }
}

export async function getUserStats(request, env, user) {
  try {
    if (!user) return errorResponse('Authentication required', 401);

    const userData = await env.DB.prepare(
      'SELECT last_fished_at FROM users WHERE id = ?'
    ).bind(user.userId).first();

    const cooldown = getCooldownStatus(userData?.last_fished_at);

    const catches = await env.DB.prepare(`
      SELECT fish_name, fish_rarity, points, caught_at
      FROM fishing_catches
      WHERE user_id = ?
      ORDER BY caught_at DESC
      LIMIT 20
    `).bind(user.userId).all();

    const rank = await env.DB.prepare(`
      SELECT COUNT(*) + 1 as rank
      FROM users
      WHERE fishing_points > (SELECT fishing_points FROM users WHERE id = ?)
    `).bind(user.userId).first();

    return jsonResponse({
      catches: catches.results || [],
      rank: rank?.rank || null,
      canFish: cooldown.canFish,
      nextCastAt: cooldown.nextCastAt,
      msRemaining: cooldown.msRemaining,
    });
  } catch (error) {
    console.error('getUserStats error:', error);
    return errorResponse('Failed to fetch stats', 500);
  }
}
