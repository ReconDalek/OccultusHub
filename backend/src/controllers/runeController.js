import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';

const COOLDOWN_HOURS = 12;

function getCooldownStatus(lastCastAt) {
  if (!lastCastAt) return { canCast: true, nextCastAt: null, msRemaining: 0 };
  const last = new Date(lastCastAt.replace(' ', 'T') + 'Z');
  const nextCast = new Date(last.getTime() + COOLDOWN_HOURS * 60 * 60 * 1000);
  const now = Date.now();
  if (now >= nextCast.getTime()) return { canCast: true, nextCastAt: null, msRemaining: 0 };
  return { canCast: false, nextCastAt: nextCast.toISOString(), msRemaining: nextCast.getTime() - now };
}

export async function startCast(request, env, user) {
  try {
    if (!user) return errorResponse('Authentication required', 401);

    const userData = await env.DB.prepare(
      'SELECT last_rune_cast_at FROM users WHERE id = ?'
    ).bind(user.userId).first();

    const status = getCooldownStatus(userData?.last_rune_cast_at);

    if (!status.canCast) {
      return jsonResponse({ ok: false, nextCastAt: status.nextCastAt, msRemaining: status.msRemaining });
    }

    await env.DB.prepare(
      'UPDATE users SET last_rune_cast_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(user.userId).run();

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error('rune startCast error:', error);
    return errorResponse('Failed to start cast', 500);
  }
}

export async function recordCast(request, env, user) {
  try {
    if (!user) return errorResponse('Authentication required', 401);

    const { rune1, rune2, rune3, bonusType, points } = await request.json();

    if (!rune1 || !rune2 || !rune3 || typeof points !== 'number' || points < 0) {
      return errorResponse('Invalid cast data', 400);
    }

    const userData = await env.DB.prepare(
      'SELECT last_rune_cast_at FROM users WHERE id = ?'
    ).bind(user.userId).first();

    if (!userData?.last_rune_cast_at) {
      return errorResponse('No active cast session', 403);
    }

    const castAt = new Date(userData.last_rune_cast_at.replace(' ', 'T') + 'Z');
    if (Date.now() - castAt.getTime() > 10 * 60 * 1000) {
      return errorResponse('Cast session expired', 403);
    }

    await env.DB.prepare(
      'INSERT INTO rune_casts (user_id, rune1, rune2, rune3, bonus_type, points) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(user.userId, rune1, rune2, rune3, bonusType || null, points).run();

    await env.DB.prepare(
      'UPDATE users SET rune_points = COALESCE(rune_points, 0) + ? WHERE id = ?'
    ).bind(points, user.userId).run();

    const updated = await env.DB.prepare(
      'SELECT rune_points FROM users WHERE id = ?'
    ).bind(user.userId).first();

    return jsonResponse({ success: true, totalPoints: updated?.rune_points || 0 });
  } catch (error) {
    console.error('recordCast error:', error);
    return errorResponse('Failed to record cast', 500);
  }
}

export async function getLeaderboard(request, env) {
  try {
    const result = await env.DB.prepare(`
      SELECT u.torn_user_id, u.username, u.image_url, u.faction_id, u.rune_points,
             COUNT(rc.id) as total_casts
      FROM users u
      LEFT JOIN rune_casts rc ON u.id = rc.user_id
      WHERE u.rune_points > 0
      GROUP BY u.id
      ORDER BY u.rune_points DESC
      LIMIT 50
    `).all();

    return jsonResponse({ leaderboard: result.results || [] });
  } catch (error) {
    console.error('rune getLeaderboard error:', error);
    return errorResponse('Failed to fetch leaderboard', 500);
  }
}

export async function resetLeaderboard(request, env, user) {
  try {
    await env.DB.prepare('UPDATE users SET rune_points = 0, last_rune_cast_at = NULL').run();
    await env.DB.prepare('DELETE FROM rune_casts').run();
    return jsonResponse({ success: true, message: 'Rune leaderboard reset' });
  } catch (error) {
    console.error('rune resetLeaderboard error:', error);
    return errorResponse('Failed to reset leaderboard', 500);
  }
}
