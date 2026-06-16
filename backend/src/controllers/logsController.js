import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';

const PAGE_SIZE = 100;

export async function getLogs(request, env) {
  try {
    const url = new URL(request.url);
    const category = url.searchParams.get('category') || null;
    const level    = url.searchParams.get('level')    || null;
    const search   = url.searchParams.get('search')   || null;
    const before   = url.searchParams.get('before')   || null; // cursor: created_at of last row
    const limit    = Math.min(parseInt(url.searchParams.get('limit') || PAGE_SIZE, 10), 200);

    let where = [];
    let binds = [];

    if (category) { where.push('category = ?'); binds.push(category); }
    if (level)    { where.push('level = ?');    binds.push(level); }
    if (search)   { where.push('(message LIKE ? OR event LIKE ? OR username LIKE ?)'); binds.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (before)   { where.push('created_at < ?'); binds.push(parseInt(before, 10)); }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = await env.DB.prepare(
      `SELECT id, created_at, category, level, event, message, torn_user_id, username, faction_id, meta
       FROM system_logs
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT ?`
    ).bind(...binds, limit).all();

    // Distinct category/level options for filter dropdowns
    const categories = await env.DB.prepare(
      `SELECT DISTINCT category FROM system_logs ORDER BY category`
    ).all();

    return jsonResponse({
      logs: (rows.results || []).map(r => ({
        ...r,
        meta: r.meta ? (() => { try { return JSON.parse(r.meta); } catch { return r.meta; } })() : null,
      })),
      hasMore: (rows.results || []).length === limit,
      categories: (categories.results || []).map(r => r.category),
    });
  } catch (error) {
    console.error('getLogs error:', error);
    return errorResponse('Failed to fetch logs', 500);
  }
}

export async function clearOldLogs(env, olderThanDays = 90) {
  const cutoff = Math.floor(Date.now() / 1000) - (olderThanDays * 86400);
  const result = await env.DB.prepare(
    `DELETE FROM system_logs WHERE created_at < ?`
  ).bind(cutoff).run();
  return result.changes;
}
