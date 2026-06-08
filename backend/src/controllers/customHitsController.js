import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';

const FACTION_IDS = [33097, 9728, 9171];

// ── POST /api/leadership/custom-hits ─────────────────────────────────────────
// Save a batch of custom hits for multiple members in one request.
// Body: { faction_id, hit_type, notes?, members: [{ torn_user_id, username?, hits }] }

export async function saveCustomHits(request, env, user) {
  try {
    const body = await request.json();
    const { faction_id, hit_type, notes, members } = body;

    if (!faction_id || !FACTION_IDS.includes(faction_id)) {
      return errorResponse('Invalid faction_id', 400);
    }
    if (!hit_type || !hit_type.trim()) {
      return errorResponse('hit_type is required', 400);
    }
    if (!Array.isArray(members) || !members.length) {
      return errorResponse('members array required', 400);
    }

    const type     = hit_type.trim();
    const notesTxt = notes?.trim() || null;
    let saved = 0;

    const customHitsStmts    = [];
    const factionMemberStmts = [];

    for (const m of members) {
      const tornId = parseInt(m.torn_user_id, 10);
      const hits   = parseInt(m.hits, 10);
      if (!tornId || !(hits > 0)) continue;

      customHitsStmts.push(
        env.DB.prepare(
          `INSERT INTO custom_hits
             (faction_id, torn_user_id, username, hit_type, hits, notes, saved_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(faction_id, tornId, m.username ?? null, type, hits, notesTxt, user.userId)
      );

      if (m.username) {
        factionMemberStmts.push(
          env.DB.prepare(
            `INSERT OR IGNORE INTO faction_members
               (torn_user_id, username, faction_id, is_active, joined_at, last_updated_at)
             VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
          ).bind(tornId, m.username, faction_id)
        );
      }

      saved++;
    }

    for (let i = 0; i < customHitsStmts.length; i += 100) {
      await env.DB.batch(customHitsStmts.slice(i, i + 100));
    }
    for (let i = 0; i < factionMemberStmts.length; i += 100) {
      await env.DB.batch(factionMemberStmts.slice(i, i + 100));
    }

    return jsonResponse({ saved, message: `${saved} custom hit record${saved !== 1 ? 's' : ''} saved` });
  } catch (err) {
    console.error('saveCustomHits error:', err);
    return errorResponse('Failed to save custom hits', 500);
  }
}

// ── GET /api/leadership/custom-hits?faction_id=X ─────────────────────────────
// Returns recent custom hit entries for a faction (last 100, newest first).

export async function getCustomHits(request, env) {
  try {
    const url       = new URL(request.url);
    const factionId = parseInt(url.searchParams.get('faction_id'), 10);

    if (!factionId || !FACTION_IDS.includes(factionId)) {
      return errorResponse('Invalid or missing faction_id', 400);
    }

    const result = await env.DB.prepare(
      `SELECT id, torn_user_id, username, hit_type, hits, notes, saved_at
       FROM custom_hits
       WHERE faction_id = ?
       ORDER BY saved_at DESC
       LIMIT 100`
    ).bind(factionId).all();

    return jsonResponse({ entries: result.results || [] });
  } catch (err) {
    console.error('getCustomHits error:', err);
    return errorResponse('Failed to fetch custom hits', 500);
  }
}
