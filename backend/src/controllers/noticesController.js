import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';

// GET /api/leadership/notices
export async function getNotices(request, env) {
  const rows = await env.DB.prepare(`
    SELECT n.id, n.content, n.created_at, u.username
    FROM notices n
    JOIN users u ON u.id = n.created_by
    ORDER BY n.created_at DESC
    LIMIT 10
  `).all();

  return jsonResponse({ notices: rows.results });
}

// POST /api/leadership/notices
export async function createNotice(request, env, user) {
  const { content } = await request.json();
  if (!content?.trim()) return errorResponse('Content required', 400);
  if (content.length > 1000) return errorResponse('Notice too long (max 1000 chars)', 400);

  const result = await env.DB.prepare(
    'INSERT INTO notices (content, created_by) VALUES (?, ?)'
  ).bind(content.trim(), user.userId).run();

  const notice = await env.DB.prepare(`
    SELECT n.id, n.content, n.created_at, u.username
    FROM notices n JOIN users u ON u.id = n.created_by
    WHERE n.id = ?
  `).bind(result.meta.last_row_id).first();

  return jsonResponse({ notice }, 201);
}

// DELETE /api/leadership/notices/:id
export async function deleteNotice(request, env) {
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();

  const existing = await env.DB.prepare('SELECT id FROM notices WHERE id = ?').bind(id).first();
  if (!existing) return errorResponse('Notice not found', 404);

  await env.DB.prepare('DELETE FROM notices WHERE id = ?').bind(id).run();
  return jsonResponse({ success: true });
}
