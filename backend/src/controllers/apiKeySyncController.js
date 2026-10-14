import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { checkBotSecret } from './ocInactivityController.js';

// ── GET /api/discord/api-keys — every member-submitted API key on file ───────
// Lets the Discord bot sync its own key registry from what members have
// already submitted to the website, instead of requiring a separate
// submission to the bot. The bot still re-validates and categorizes each key
// itself against Torn's live API (faction/position can drift after login) —
// this just saves members from submitting a key twice.
export async function getApiKeysForBot(request, env) {
  if (!checkBotSecret(request, env)) return errorResponse('Unauthorized', 401);
  try {
    const { results } = await env.DB.prepare(
      `SELECT torn_user_id, username, faction_id, faction_position, api_key
       FROM users WHERE api_key IS NOT NULL AND api_key != ''`
    ).all();

    const keys = [];
    for (const r of results || []) {
      try {
        keys.push({
          torn_user_id: r.torn_user_id,
          username: r.username,
          faction_id: r.faction_id,
          faction_position: r.faction_position,
          api_key: atob(r.api_key),
        });
      } catch {
        // undecodable — skip rather than fail the whole sync
      }
    }

    return jsonResponse({ keys });
  } catch (e) {
    console.error('getApiKeysForBot error:', e);
    return errorResponse('Failed to fetch API keys: ' + e.message, 500);
  }
}
