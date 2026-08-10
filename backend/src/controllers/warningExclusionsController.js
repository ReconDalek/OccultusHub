import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';

const VALID_TYPES = ['Energy', 'Chain'];

// GET /api/leadership/warnings/exclusions?warning_type=Energy&year=2026&month=7
// Scoped to a calendar month (not a specific chain/report run) so a toggle
// made while generating one report persists if the same month is regenerated
// later, including from a different report of the same type.
export async function getWarningExclusions(request, env) {
  try {
    const url         = new URL(request.url);
    const warningType = url.searchParams.get('warning_type');
    const year        = parseInt(url.searchParams.get('year'), 10);
    const month       = parseInt(url.searchParams.get('month'), 10);

    if (!VALID_TYPES.includes(warningType) || !year || !month) {
      return errorResponse('warning_type (Energy|Chain), year, and month are required', 400);
    }

    const { results } = await env.DB.prepare(`
      SELECT id, torn_user_id, username
      FROM warning_exclusions
      WHERE warning_type = ? AND year = ? AND month = ?
    `).bind(warningType, year, month).all();

    return jsonResponse({ exclusions: results || [] });
  } catch (err) {
    console.error('getWarningExclusions error:', err);
    return errorResponse('Failed to fetch warning exclusions', 500);
  }
}

// POST /api/leadership/warnings/exclusions
// Body: { torn_user_id, username, warning_type, year, month }
export async function addWarningExclusion(request, env, user) {
  try {
    const body = await request.json();
    const { torn_user_id, username, warning_type, year, month } = body;

    if (!torn_user_id || !VALID_TYPES.includes(warning_type) || !year || !month) {
      return errorResponse('Missing/invalid fields: torn_user_id, warning_type (Energy|Chain), year, month', 400);
    }

    const { meta } = await env.DB.prepare(`
      INSERT INTO warning_exclusions
        (torn_user_id, username, warning_type, year, month, created_by, created_by_username)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(torn_user_id, warning_type, year, month) DO NOTHING
    `).bind(torn_user_id, username || null, warning_type, year, month, user.tornUserId, user.username).run();

    let id = meta.last_row_id;
    if (!id) {
      const existing = await env.DB.prepare(`
        SELECT id FROM warning_exclusions WHERE torn_user_id = ? AND warning_type = ? AND year = ? AND month = ?
      `).bind(torn_user_id, warning_type, year, month).first();
      id = existing?.id ?? null;
    }

    return jsonResponse({ message: 'Member excused for this month', id });
  } catch (err) {
    console.error('addWarningExclusion error:', err);
    return errorResponse('Failed to add warning exclusion', 500);
  }
}

// DELETE /api/leadership/warnings/exclusions/:id
export async function deleteWarningExclusion(request, env) {
  try {
    const id = parseInt(new URL(request.url).pathname.split('/').pop(), 10);
    if (!id) return errorResponse('Invalid exclusion ID', 400);

    await env.DB.prepare(`DELETE FROM warning_exclusions WHERE id = ?`).bind(id).run();
    return jsonResponse({ message: 'Exclusion removed' });
  } catch (err) {
    console.error('deleteWarningExclusion error:', err);
    return errorResponse('Failed to remove warning exclusion', 500);
  }
}
