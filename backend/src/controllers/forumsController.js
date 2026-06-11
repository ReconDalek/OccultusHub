import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';

export async function listPosts(request, env) {
  try {
    const result = await env.DB.prepare(`
      SELECT id, title, author_id, author_name, category, created_at, updated_at
      FROM forum_posts
      ORDER BY created_at DESC
    `).all();
    return jsonResponse({ posts: result.results || [] });
  } catch (error) {
    console.error('listPosts error:', error);
    return errorResponse('Failed to fetch posts', 500);
  }
}

export async function getPost(request, env, user, postId) {
  try {
    const post = await env.DB.prepare(
      'SELECT * FROM forum_posts WHERE id = ?'
    ).bind(postId).first();
    if (!post) return errorResponse('Post not found', 404);
    return jsonResponse({ post });
  } catch (error) {
    console.error('getPost error:', error);
    return errorResponse('Failed to fetch post', 500);
  }
}

export async function createPost(request, env, user) {
  try {
    const { title, content, category = 'general' } = await request.json();
    if (!title?.trim()) return errorResponse('Title is required', 400);
    if (!content?.trim()) return errorResponse('Content is required', 400);

    const result = await env.DB.prepare(`
      INSERT INTO forum_posts (title, content, author_id, author_name, category)
      VALUES (?, ?, ?, ?, ?)
    `).bind(title.trim(), content, user.userId, user.username, category).run();

    return jsonResponse({ id: result.meta.last_row_id }, 201);
  } catch (error) {
    console.error('createPost error:', error);
    return errorResponse('Failed to create post', 500);
  }
}

export async function updatePost(request, env, user, postId) {
  try {
    const post = await env.DB.prepare(
      'SELECT * FROM forum_posts WHERE id = ?'
    ).bind(postId).first();
    if (!post) return errorResponse('Post not found', 404);

    const canEdit = String(post.author_id) === String(user.userId) || user.isAdmin === true || user.isLeader === true;

    if (!canEdit) return errorResponse('Not authorized to edit this post', 403);

    const { title, content, category } = await request.json();
    if (!title?.trim()) return errorResponse('Title is required', 400);
    if (!content?.trim()) return errorResponse('Content is required', 400);

    await env.DB.prepare(`
      UPDATE forum_posts
      SET title = ?, content = ?, category = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(title.trim(), content, category || post.category, postId).run();

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error('updatePost error:', error);
    return errorResponse('Failed to update post', 500);
  }
}

export async function deletePost(request, env, user, postId) {
  try {
    const post = await env.DB.prepare(
      'SELECT * FROM forum_posts WHERE id = ?'
    ).bind(postId).first();
    if (!post) return errorResponse('Post not found', 404);

    const canDelete = String(post.author_id) === String(user.userId) || user.isAdmin === true || user.isLeader === true;
    if (!canDelete) return errorResponse('Not authorized to delete this post', 403);

    await env.DB.prepare('DELETE FROM forum_posts WHERE id = ?').bind(postId).run();
    return jsonResponse({ ok: true });
  } catch (error) {
    console.error('deletePost error:', error);
    return errorResponse('Failed to delete post', 500);
  }
}
