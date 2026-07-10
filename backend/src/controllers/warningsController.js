import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';

const FACTION_IDS = [33097, 9728, 9171];

// GET /api/leadership/warnings
// Returns all warnings joined with faction_members for is_active + level.
// Optional ?member=torn_user_id to filter to one member.
export async function getWarnings(request, env) {
  try {
    const url      = new URL(request.url);
    const memberId = url.searchParams.get('member');

    let query = `
      SELECT
        w.id,
        w.torn_user_id,
        w.username,
        w.date_reported,
        w.date_issued,
        w.period,
        w.warning_type,
        w.target_value,
        w.achieved_value,
        w.comment,
        w.issued_by,
        w.issued_by_username,
        w.created_at,
        fm.is_active,
        fm.level,
        fm.faction_id AS current_faction_id
      FROM member_warnings w
      LEFT JOIN faction_members fm ON fm.torn_user_id = w.torn_user_id
    `;

    const binds = [];
    if (memberId) {
      query += ` WHERE w.torn_user_id = ?`;
      binds.push(parseInt(memberId, 10));
    }

    query += ` ORDER BY w.date_reported DESC, w.id DESC`;

    const stmt   = binds.length ? env.DB.prepare(query).bind(...binds) : env.DB.prepare(query);
    const result = await stmt.all();

    return jsonResponse({ warnings: result.results || [] });
  } catch (err) {
    console.error('getWarnings error:', err);
    return errorResponse('Failed to fetch warnings', 500);
  }
}

// GET /api/leadership/warnings/members
// Returns all faction members (active + departed) for the add-warning form picker.
export async function getWarningMembers(request, env) {
  try {
    const { results } = await env.DB.prepare(`
      SELECT torn_user_id, username, faction_id, level, is_active, faction_position
      FROM faction_members
      ORDER BY is_active DESC, username ASC
    `).all();
    return jsonResponse({ members: results || [] });
  } catch (err) {
    console.error('getWarningMembers error:', err);
    return errorResponse('Failed to fetch members', 500);
  }
}

// POST /api/leadership/warnings
// Body: { torn_user_id, username, date_reported, date_issued?, period,
//         warning_type, target_value?, achieved_value?, comment? }
export async function addWarning(request, env, user) {
  try {
    const body = await request.json();
    const {
      torn_user_id, username, date_reported, date_issued,
      period, warning_type, target_value, achieved_value, comment,
    } = body;

    if (!torn_user_id || !username || !date_reported || !period || !warning_type) {
      return errorResponse('Missing required fields: torn_user_id, username, date_reported, period, warning_type', 400);
    }

    const now = Math.floor(Date.now() / 1000);

    const { meta } = await env.DB.prepare(`
      INSERT INTO member_warnings
        (torn_user_id, username, date_reported, date_issued, period, warning_type,
         target_value, achieved_value, comment, issued_by, issued_by_username, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      torn_user_id, username, date_reported, date_issued || null, period, warning_type,
      target_value ?? null, achieved_value ?? null, comment || null,
      user.tornUserId, user.username, now
    ).run();

    return jsonResponse({ message: 'Warning added', id: meta.last_row_id });
  } catch (err) {
    console.error('addWarning error:', err);
    return errorResponse('Failed to add warning', 500);
  }
}

// DELETE /api/leadership/warnings/:id
export async function deleteWarning(request, env) {
  try {
    const id = parseInt(new URL(request.url).pathname.split('/').pop(), 10);
    if (!id) return errorResponse('Invalid warning ID', 400);

    await env.DB.prepare(`DELETE FROM member_warnings WHERE id = ?`).bind(id).run();
    return jsonResponse({ message: 'Warning deleted' });
  } catch (err) {
    console.error('deleteWarning error:', err);
    return errorResponse('Failed to delete warning', 500);
  }
}

// PUT /api/leadership/warnings/:id/comment
// Body: { comment }  — update comment/response on an existing warning
export async function updateWarningComment(request, env) {
  try {
    const id      = parseInt(new URL(request.url).pathname.split('/').slice(-2, -1)[0], 10);
    const { comment, date_issued } = await request.json();
    if (!id) return errorResponse('Invalid warning ID', 400);

    await env.DB.prepare(
      `UPDATE member_warnings SET comment = ?, date_issued = COALESCE(?, date_issued) WHERE id = ?`
    ).bind(comment ?? null, date_issued ?? null, id).run();

    return jsonResponse({ message: 'Warning updated' });
  } catch (err) {
    console.error('updateWarningComment error:', err);
    return errorResponse('Failed to update warning', 500);
  }
}
