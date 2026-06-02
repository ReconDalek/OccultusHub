import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';

export async function getEvents(request, env) {
  try {
    const today = new Date().toISOString().substring(0, 10);
    const result = await env.DB.prepare(
      `SELECT * FROM events WHERE event_date >= ? ORDER BY event_date ASC LIMIT 100`
    ).bind(today).all();
    return jsonResponse({ events: result.results || [] });
  } catch (error) {
    console.error('getEvents error:', error);
    return errorResponse('Failed to fetch events', 500);
  }
}

export async function createEvent(request, env, user) {
  try {
    const { title, description, event_date } = await request.json();
    if (!title || !event_date) return errorResponse('Title and date are required', 400);

    const result = await env.DB.prepare(
      `INSERT INTO events (title, description, event_date, created_by) VALUES (?, ?, ?, ?) RETURNING *`
    ).bind(title.trim(), description?.trim() || '', event_date, user.userId).first();

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
    const result = await env.DB.prepare(
      `SELECT * FROM faction_schedules WHERE scheduled_at >= ? ORDER BY scheduled_at ASC`
    ).bind(now).all();
    return jsonResponse({ schedules: result.results || [] });
  } catch (error) {
    console.error('getFactionSchedules error:', error);
    return errorResponse('Failed to fetch faction schedules', 500);
  }
}

export async function createFactionSchedule(request, env, user) {
  try {
    const { faction_id, type, scheduled_at } = await request.json();
    if (!faction_id || !type || !scheduled_at) {
      return errorResponse('faction_id, type, and scheduled_at are required', 400);
    }
    if (!['chain', 'war'].includes(type)) {
      return errorResponse('type must be chain or war', 400);
    }

    const result = await env.DB.prepare(
      `INSERT INTO faction_schedules (faction_id, type, scheduled_at, created_by) VALUES (?, ?, ?, ?) RETURNING *`
    ).bind(faction_id, type, scheduled_at, user.userId).first();

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
