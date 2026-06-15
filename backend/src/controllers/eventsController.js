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

export async function updateEvent(request, env, user) {
  try {
    const match = new URL(request.url).pathname.match(/\/api\/leadership\/events\/(\d+)/);
    if (!match) return errorResponse('Invalid event ID', 400);
    const { title, description, start_date, end_date, start_time, end_time, category } = await request.json();
    if (!title || !start_date) return errorResponse('Title and start date are required', 400);

    const result = await env.DB.prepare(
      `UPDATE events
       SET title = ?, description = ?, start_date = ?, end_date = ?,
           start_time = ?, end_time = ?, category = ?
       WHERE id = ?
       RETURNING *`
    ).bind(
      title.trim(),
      description?.trim() || '',
      start_date,
      end_date || null,
      start_time || null,
      end_time || null,
      category || null,
      match[1]
    ).first();

    if (!result) return errorResponse('Event not found', 404);
    return jsonResponse({ event: result });
  } catch (error) {
    console.error('updateEvent error:', error);
    return errorResponse('Failed to update event', 500);
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

function epochToDate(epoch) {
  return new Date(epoch * 1000).toISOString().split('T')[0];
}

function epochToTime(epoch) {
  const d = new Date(epoch * 1000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export async function importTornEvents(request, env, user) {
  try {
    // Get the requesting user's stored API key
    const userData = await env.DB.prepare('SELECT api_key FROM users WHERE id = ?').bind(user.userId).first();
    if (!userData?.api_key) return errorResponse('No API key on file', 400);

    const apiKey = atob(userData.api_key);

    const tornRes = await fetch('https://api.torn.com/v2/torn/calendar?comment=OccHub', {
      headers: { Authorization: `ApiKey ${apiKey}` },
    });
    if (!tornRes.ok) return errorResponse('Failed to fetch Torn calendar', 502);

    const tornData = await tornRes.json();
    const { competitions = [], events = [] } = tornData?.calendar ?? {};

    const toInsert = [
      ...competitions.map(e => ({ ...e, torn_type: 'competition' })),
      ...events.map(e => ({ ...e, torn_type: 'event' })),
    ];

    let imported = 0;
    let updated = 0;

    for (const ev of toInsert) {
      const tornRef = `torn_${ev.torn_type}_${ev.start}`;
      const startDate = epochToDate(ev.start);
      const endDate   = epochToDate(ev.end);
      const fixedStart = ev.fixed_start_time ? 1 : 0;
      // Always store the epoch-derived time; frontend substitutes user's personal start for non-fixed events
      const startTime = epochToTime(ev.start);
      const endTime   = epochToTime(ev.end);
      const category  = ev.torn_type; // 'event' | 'competition'

      const existing = await env.DB.prepare(
        'SELECT id FROM events WHERE torn_ref = ?'
      ).bind(tornRef).first();

      if (existing) {
        await env.DB.prepare(
          `UPDATE events
           SET title = ?, description = ?, start_date = ?, end_date = ?,
               start_time = ?, end_time = ?, fixed_start_time = ?, category = ?
           WHERE torn_ref = ?`
        ).bind(
          ev.title, ev.description || '', startDate, endDate,
          startTime, endTime, fixedStart, category, tornRef
        ).run();
        updated++;
      } else {
        await env.DB.prepare(
          `INSERT INTO events
             (title, description, start_date, end_date, start_time, end_time,
              category, source, torn_ref, fixed_start_time, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'torn', ?, ?, ?)`
        ).bind(
          ev.title, ev.description || '', startDate, endDate,
          startTime, endTime, category, tornRef, fixedStart, user.userId
        ).run();
        imported++;
      }
    }

    return jsonResponse({ imported, updated, total: toInsert.length });
  } catch (error) {
    console.error('importTornEvents error:', error);
    return errorResponse('Failed to import Torn events', 500);
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

    // Fetch faction name if an opponent ID is provided for active wars
    let opponent_faction_name = null;
    if (opponent_faction_id && resolvedStage === 'active') {
      try {
        const { getRandomUserApiKey } = await import('../services/tornApiService.js');
        const apiKey = await getRandomUserApiKey(env);
        if (apiKey) {
          const tornRes = await fetch(
            `https://api.torn.com/v2/faction/${opponent_faction_id}/basic?comment=OccHub`,
            { headers: { Authorization: `ApiKey ${apiKey}` } }
          );
          if (tornRes.ok) {
            const tornData = await tornRes.json();
            opponent_faction_name = tornData?.basic?.name ?? null;
          }
        }
      } catch (e) {
        console.warn('Could not fetch opponent faction name:', e);
      }
    }

    const result = await env.DB.prepare(
      `INSERT INTO faction_schedules (faction_id, type, stage, scheduled_at, opponent_faction_id, opponent_faction_name, chain_target, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
    ).bind(
      faction_id,
      type,
      resolvedStage,
      scheduled_at || null,
      opponent_faction_id || null,
      opponent_faction_name,
      chain_target || null,
      user.userId
    ).first();

    return jsonResponse({ schedule: result });
  } catch (error) {
    console.error('createFactionSchedule error:', error);
    return errorResponse('Failed to create faction schedule', 500);
  }
}

export async function advanceFactionSchedule(request, env, user) {
  try {
    const match = new URL(request.url).pathname.match(/\/api\/leadership\/faction-schedules\/(?<id>\d+)\/advance/);
    const { id } = match?.groups ?? {};
    const { scheduled_at, opponent_faction_id } = await request.json();

    if (!scheduled_at) return errorResponse('scheduled_at is required', 400);

    // Fetch faction name from Torn API if an opponent ID was provided
    let opponent_faction_name = null;
    if (opponent_faction_id) {
      try {
        const { getRandomUserApiKey } = await import('../services/tornApiService.js');
        const apiKey = await getRandomUserApiKey(env);
        if (apiKey) {
          const tornRes = await fetch(
            `https://api.torn.com/v2/faction/${opponent_faction_id}/basic?comment=OccHub`,
            { headers: { Authorization: `ApiKey ${apiKey}` } }
          );
          if (tornRes.ok) {
            const tornData = await tornRes.json();
            opponent_faction_name = tornData?.basic?.name ?? null;
          }
        }
      } catch (e) {
        console.warn('Could not fetch opponent faction name:', e);
      }
    }

    const result = await env.DB.prepare(
      `UPDATE faction_schedules
       SET stage = 'active', scheduled_at = ?, opponent_faction_id = ?, opponent_faction_name = ?
       WHERE id = ? AND stage = 'enlisting'
       RETURNING *`
    ).bind(scheduled_at, opponent_faction_id || null, opponent_faction_name, id).first();

    if (!result) return errorResponse('Schedule not found or not in enlisting stage', 404);

    return jsonResponse({ schedule: result });
  } catch (error) {
    console.error('advanceFactionSchedule error:', error);
    return errorResponse('Failed to advance schedule', 500);
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
