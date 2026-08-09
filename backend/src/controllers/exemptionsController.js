import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';

const VALID_TYPES = ['Energy', 'Chain', 'War', 'All'];

// GET /api/leadership/exemptions
// Optional ?member=torn_user_id to filter to one member.
export async function getExemptions(request, env) {
  try {
    const url      = new URL(request.url);
    const memberId = url.searchParams.get('member');

    let query = `SELECT * FROM member_exemptions`;
    const binds = [];
    if (memberId) {
      query += ` WHERE torn_user_id = ?`;
      binds.push(parseInt(memberId, 10));
    }
    query += ` ORDER BY date_start DESC, id DESC`;

    const { results } = await env.DB.prepare(query).bind(...binds).all();
    return jsonResponse({ exemptions: results || [] });
  } catch (err) {
    console.error('getExemptions error:', err);
    return errorResponse('Failed to fetch exemptions', 500);
  }
}

// POST /api/leadership/exemptions
// Body: { torn_user_id, username, exemption_type, date_start, date_end, reason? }
export async function addExemption(request, env, user) {
  try {
    const body = await request.json();
    const { torn_user_id, username, exemption_type, date_start, date_end, reason } = body;

    if (!torn_user_id || !username || !exemption_type || !date_start || !date_end) {
      return errorResponse('Missing required fields: torn_user_id, username, exemption_type, date_start, date_end', 400);
    }
    if (!VALID_TYPES.includes(exemption_type)) {
      return errorResponse(`exemption_type must be one of: ${VALID_TYPES.join(', ')}`, 400);
    }
    if (date_end < date_start) {
      return errorResponse('date_end must not be before date_start', 400);
    }

    const now = Math.floor(Date.now() / 1000);
    const { meta } = await env.DB.prepare(`
      INSERT INTO member_exemptions
        (torn_user_id, username, exemption_type, date_start, date_end, reason, created_by, created_by_username, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      torn_user_id, username, exemption_type, date_start, date_end,
      reason || null, user.tornUserId, user.username, now
    ).run();

    return jsonResponse({ message: 'Exemption added', id: meta.last_row_id });
  } catch (err) {
    console.error('addExemption error:', err);
    return errorResponse('Failed to add exemption', 500);
  }
}

// DELETE /api/leadership/exemptions/:id
export async function deleteExemption(request, env) {
  try {
    const id = parseInt(new URL(request.url).pathname.split('/').pop(), 10);
    if (!id) return errorResponse('Invalid exemption ID', 400);

    await env.DB.prepare(`DELETE FROM member_exemptions WHERE id = ?`).bind(id).run();
    return jsonResponse({ message: 'Exemption deleted' });
  } catch (err) {
    console.error('deleteExemption error:', err);
    return errorResponse('Failed to delete exemption', 500);
  }
}
