import { SignJWT, jwtVerify } from 'jose';
import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';

const DISCORD_API = 'https://discord.com/api/v10';

function getRedirectUri(request, env) {
  if (env.DISCORD_REDIRECT_URI) return env.DISCORD_REDIRECT_URI;
  const url = new URL(request.url);
  return `${url.origin}/api/discord/callback`;
}

async function createStateToken(userId, env) {
  const secret = new TextEncoder().encode(env.JWT_SECRET + '_discord_state');
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('10m')
    .sign(secret);
}

async function verifyStateToken(state, env) {
  try {
    const secret = new TextEncoder().encode(env.JWT_SECRET + '_discord_state');
    const { payload } = await jwtVerify(state, secret);
    return payload.userId;
  } catch {
    return null;
  }
}

// GET /api/discord/auth (authenticated) — returns Discord OAuth URL
export async function getAuthUrl(request, env, user) {
  const state = await createStateToken(user.userId, env);
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: getRedirectUri(request, env),
    response_type: 'code',
    scope: 'identify',
    state,
  });
  return jsonResponse({ url: `https://discord.com/oauth2/authorize?${params}` });
}

// GET /api/discord/callback (public — Discord redirects here)
export async function handleCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const frontendUrl = env.CORS_ORIGIN;

  if (!code || !state) {
    return Response.redirect(`${frontendUrl}?discord=error`, 302);
  }

  const userId = await verifyStateToken(state, env);
  if (!userId) {
    return Response.redirect(`${frontendUrl}?discord=error`, 302);
  }

  // Exchange code for tokens
  const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: getRedirectUri(request, env),
    }),
  });

  if (!tokenRes.ok) {
    return Response.redirect(`${frontendUrl}?discord=error`, 302);
  }

  const tokens = await tokenRes.json();

  // Get Discord user info
  const userRes = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userRes.ok) {
    return Response.redirect(`${frontendUrl}?discord=error`, 302);
  }

  const discordUser = await userRes.json();

  await env.DB.prepare(`
    INSERT INTO discord_links (user_id, discord_id, discord_username, discord_avatar, access_token, refresh_token)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      discord_id = excluded.discord_id,
      discord_username = excluded.discord_username,
      discord_avatar = excluded.discord_avatar,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      linked_at = CURRENT_TIMESTAMP
  `).bind(
    userId,
    discordUser.id,
    discordUser.username,
    discordUser.avatar || null,
    tokens.access_token,
    tokens.refresh_token || null,
  ).run();

  return Response.redirect(`${frontendUrl}?discord=linked`, 302);
}

// GET /api/discord/status (authenticated)
export async function getStatus(request, env, user) {
  const link = await env.DB.prepare(
    'SELECT discord_id, discord_username, discord_avatar FROM discord_links WHERE user_id = ?'
  ).bind(user.userId).first();

  if (!link) return jsonResponse({ linked: false });

  const avatarUrl = link.discord_avatar
    ? `https://cdn.discordapp.com/avatars/${link.discord_id}/${link.discord_avatar}.png?size=64`
    : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(link.discord_id) % 5n)}.png`;

  return jsonResponse({
    linked: true,
    discordId: link.discord_id,
    discordUsername: link.discord_username,
    avatarUrl,
  });
}

// DELETE /api/discord/unlink (authenticated)
export async function unlinkDiscord(request, env, user) {
  await env.DB.prepare('DELETE FROM discord_links WHERE user_id = ?').bind(user.userId).run();
  return jsonResponse({ success: true });
}

// GET /api/discord/channels (authenticated)
export async function getChannels(request, env) {
  const res = await fetch(`${DISCORD_API}/guilds/${env.DISCORD_GUILD_ID}/channels`, {
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
  });

  if (!res.ok) return errorResponse('Failed to fetch channels', 502);

  const all = await res.json();

  const categories = all
    .filter(c => c.type === 4)
    .reduce((acc, c) => ({ ...acc, [c.id]: c.name }), {});

  const channels = all
    .filter(c => c.type === 0)
    .sort((a, b) => a.position - b.position)
    .map(c => ({ id: c.id, name: c.name, categoryId: c.parent_id }));

  return jsonResponse({ channels, categories });
}

// GET /api/discord/messages?channelId=X&after=Y (authenticated)
export async function getMessages(request, env) {
  const url = new URL(request.url);
  const channelId = url.searchParams.get('channelId');
  const before = url.searchParams.get('before');
  const after = url.searchParams.get('after');

  if (!channelId) return errorResponse('channelId required', 400);

  let endpoint = `${DISCORD_API}/channels/${channelId}/messages?limit=50`;
  if (before) endpoint += `&before=${before}`;
  if (after) endpoint += `&after=${after}`;

  const res = await fetch(endpoint, {
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
  });

  if (!res.ok) return errorResponse('Failed to fetch messages', 502);

  const messages = await res.json();
  return jsonResponse({ messages });
}

// POST /api/discord/messages (authenticated)
export async function sendMessage(request, env, user) {
  const body = await request.json();
  const { channelId, content } = body;

  if (!channelId || !content?.trim()) return errorResponse('channelId and content required', 400);
  if (content.length > 1800) return errorResponse('Message too long', 400);

  const attributed = `**[${user.username}]**: ${content.trim()}`;

  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content: attributed }),
  });

  if (!res.ok) return errorResponse('Failed to send message', 502);

  const msg = await res.json();
  return jsonResponse({ success: true, message: msg });
}
