import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';

export async function getEvents(request, env) {
  try {
    const today = new Date().toISOString().substring(0, 10);
    // Include events that end today or later (or single-day events today or later)
    const result = await env.DB.prepare(
      `SELECT * FROM events
       WHERE (end_date IS NOT NULL AND end_date >= ?)
          OR (end_date IS NULL AND start_date >= ?)
       ORDER BY start_date ASC LIMIT 100`
    ).bind(today, today).all();
    return jsonResponse({ events: result.results || [] });
  } catch (error) {
    console.error('getEvents error:', error);
    return errorResponse('Failed to fetch events', 500);
  }
}

export async function createEvent(request, env, user) {
  try {
    const { title, description, start_date, end_date, start_time, end_time, category } = await request.json();
    if (!title || !start_date) return errorResponse('Title and start date are required', 400);

    const result = await env.DB.prepare(
      `INSERT INTO events (title, description, start_date, end_date, start_time, end_time, category, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
    ).bind(
      title.trim(),
      description?.trim() || '',
      start_date,
      end_date || null,
      start_time || null,
      end_time || null,
      category || null,
      user.userId
    ).first();

    return jsonResponse({ event: result });
  } catch (error) {
    console.error('createEvent error:', error);
    return errorResponse('Failed to create event', 500);
  }
}

export async function deleteEvent(request, env, user) {
  try {
    const match = new URL(request.url).pathname.match(/\/api\/leadership\/events\/(\d+)/);
    if (!match) return errorResponse('Invalid event ID', 400);

    await env.DB.prepare('DELETE FROM events WHERE id = ?').bind(match[1]).run();
    return jsonResponse({ success: true });
  } catch (error) {
    console.error('deleteEvent error:', error);
    return errorResponse('Failed to delete event', 500);
  }
}

export async function getFactionSchedules(request, env) {
  try {
    const now = new Date().toISOString();
    // Return enlisting wars always + future scheduled events
    const result = await env.DB.prepare(
      `SELECT * FROM faction_schedules
       WHERE (type = 'war' AND stage = 'enlisting')
          OR (scheduled_at IS NOT NULL AND scheduled_at >= ?)
       ORDER BY
         CASE WHEN stage = 'enlisting' THEN 0 ELSE 1 END,
         scheduled_at ASC`
    ).bind(now).all();
    return jsonResponse({ schedules: result.results || [] });
  } catch (error) {
    console.error('getFactionSchedules error:', error);
    return errorResponse('Failed to fetch faction schedules', 500);
  }
}

export async function createFactionSchedule(request, env, user) {
  try {
    const { faction_id, type, stage, scheduled_at, opponent_faction_id, chain_target } = await request.json();
    if (!faction_id || !type) return errorResponse('faction_id and type are required', 400);
    if (!['chain', 'war'].includes(type)) return errorResponse('type must be chain or war', 400);

    const resolvedStage = type === 'war' ? (stage || 'enlisting') : 'active';

    // Chains and active wars need a scheduled_at
    if (resolvedStage === 'active' && !scheduled_at) {
      return errorResponse('scheduled_at is required for active events', 400);
    }

    const result = await env.DB.prepare(
      `INSERT INTO faction_schedules (faction_id, type, stage, scheduled_at, opponent_faction_id, chain_target, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`
    ).bind(
      faction_id,
      type,
      resolvedStage,
      scheduled_at || null,
      opponent_faction_id || null,
      chain_target || null,
      user.userId
    ).first();

    return jsonResponse({ schedule: result });
  } catch (error) {
    console.error('createFactionSchedule error:', error);
    return errorResponse('Failed to create faction schedule', 500);
  }
}

export async function deleteFactionSchedule(request, env, user) {
  try {
    const match = new URL(request.url).pathname.match(/\/api\/leadership\/faction-schedules\/(\d+)/);
    if (!match) return errorResponse('Invalid schedule ID', 400);

    await env.DB.prepare('DELETE FROM faction_schedules WHERE id = ?').bind(match[1]).run();
    return jsonResponse({ success: true });
  } catch (error) {
    console.error('deleteFactionSchedule error:', error);
    return errorResponse('Failed to delete schedule', 500);
  }
}
