import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';

// Fixed destination — patch notes always go to this one channel, so unlike
// webhookController's per-event configs there's no target to configure.
// Posted as the bot itself (channel message via bot token), not a webhook.
const PATCH_NOTES_CHANNEL_ID = '1559863829180063784';
const DISCORD_MESSAGE_LIMIT = 2000;

async function getCurrentDraft(env) {
  return env.DB.prepare(
    `SELECT * FROM patch_notes WHERE status = 'draft' ORDER BY id DESC LIMIT 1`
  ).first();
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/patch-notes
// ─────────────────────────────────────────────────────────────────────────────
export async function getPatchNotes(request, env) {
  try {
    const draft = await getCurrentDraft(env);
    const { results: history } = await env.DB.prepare(
      `SELECT id, content, sent_at FROM patch_notes WHERE status = 'sent' ORDER BY sent_at DESC LIMIT 10`
    ).all();
    return jsonResponse({ draft: draft || null, history: history || [] });
  } catch (err) {
    console.error('getPatchNotes error:', err);
    return errorResponse('Failed to fetch patch notes', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/admin/patch-notes  { content }
// Saves the draft's text as the admin edits it — creates the draft row if
// this is the first content of a new batch.
// ─────────────────────────────────────────────────────────────────────────────
export async function savePatchNotesDraft(request, env) {
  try {
    const { content } = await request.json();
    if (typeof content !== 'string') return errorResponse('content is required', 400);

    const existing = await getCurrentDraft(env);
    if (existing) {
      await env.DB.prepare(
        `UPDATE patch_notes SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(content, existing.id).run();
      return jsonResponse({ success: true, id: existing.id });
    }

    const result = await env.DB.prepare(
      `INSERT INTO patch_notes (content, status) VALUES (?, 'draft')`
    ).bind(content).run();
    return jsonResponse({ success: true, id: result.meta.last_row_id });
  } catch (err) {
    console.error('savePatchNotesDraft error:', err);
    return errorResponse('Failed to save draft', 500);
  }
}

// Discord caps a single message at 2000 chars — split on line breaks so a
// long batch still sends (as sequential messages) instead of failing outright.
function splitForDiscord(content) {
  if (content.length <= DISCORD_MESSAGE_LIMIT) return [content];
  const lines = content.split('\n');
  const chunks = [];
  let current = '';
  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > DISCORD_MESSAGE_LIMIT) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/patch-notes/send  { content }
// Posts the given text to the patch-notes channel and files it as sent
// history. Always sends exactly what's in the editor at click-time (not
// whatever was last explicitly saved), so a last-second edit isn't lost.
// ─────────────────────────────────────────────────────────────────────────────
export async function sendPatchNotes(request, env, user) {
  try {
    const { content } = await request.json();
    if (typeof content !== 'string' || !content.trim()) {
      return errorResponse('content is required', 400);
    }
    if (!env.DISCORD_BOT_TOKEN) return errorResponse('Discord bot token not configured', 503);

    for (const chunk of splitForDiscord(content)) {
      const res = await fetch(`https://discord.com/api/v10/channels/${PATCH_NOTES_CHANNEL_ID}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: chunk }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return errorResponse(`Discord send failed (${res.status}): ${text.slice(0, 200)}`, 502);
      }
    }

    const existing = await getCurrentDraft(env);
    if (existing) {
      await env.DB.prepare(
        `UPDATE patch_notes SET content = ?, status = 'sent', sent_at = CURRENT_TIMESTAMP, sent_by = ? WHERE id = ?`
      ).bind(content, user.userId, existing.id).run();
    } else {
      await env.DB.prepare(
        `INSERT INTO patch_notes (content, status, sent_at, sent_by) VALUES (?, 'sent', CURRENT_TIMESTAMP, ?)`
      ).bind(content, user.userId).run();
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('sendPatchNotes error:', err);
    return errorResponse('Failed to send patch notes', 500);
  }
}
