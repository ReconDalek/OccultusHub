import { SignJWT, jwtVerify } from 'jose';
import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';

const DISCORD_API = 'https://discord.com/api/v10';

const ALLOWED_FACTION_IDS = [33097, 9728, 9171];
const MEMBER_CHANNELS = ['905593589755678780', '856861435950268470'];
const LEADER_CHANNELS = ['1003296296838385784'];

function allowedChannelsFor(user) {
  return user.isLeader || user.isAdmin
    ? [...MEMBER_CHANNELS, ...LEADER_CHANNELS]
    : MEMBER_CHANNELS;
}

async function requireFactionMember(userId, env) {
  const row = await env.DB.prepare('SELECT faction_id FROM users WHERE id = ?').bind(userId).first();
  return ALLOWED_FACTION_IDS.includes(row?.faction_id);
}

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
  const isMember = await requireFactionMember(user.userId, env);
  if (!isMember) return errorResponse('Faction members only', 403);

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
export async function getChannels(request, env, user) {
  const isMember = await requireFactionMember(user.userId, env);
  if (!isMember) return errorResponse('Faction members only', 403);

  const allowed = allowedChannelsFor(user);

  const res = await fetch(`${DISCORD_API}/guilds/${env.DISCORD_GUILD_ID}/channels`, {
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
  });

  if (!res.ok) return errorResponse('Failed to fetch channels', 502);

  const all = await res.json();

  const categories = all
    .filter(c => c.type === 4)
    .reduce((acc, c) => ({ ...acc, [c.id]: c.name }), {});

  const channels = all
    .filter(c => c.type === 0 && allowed.includes(c.id))
    .sort((a, b) => a.position - b.position)
    .map(c => ({ id: c.id, name: c.name, categoryId: c.parent_id }));

  return jsonResponse({ channels, categories });
}

// GET /api/discord/messages?channelId=X&after=Y (authenticated)
export async function getMessages(request, env, user) {
  const isMember = await requireFactionMember(user.userId, env);
  if (!isMember) return errorResponse('Faction members only', 403);

  const url = new URL(request.url);
  const channelId = url.searchParams.get('channelId');
  const before = url.searchParams.get('before');
  const after = url.searchParams.get('after');

  if (!channelId) return errorResponse('channelId required', 400);

  if (!allowedChannelsFor(user).includes(channelId)) {
    return errorResponse('Channel not permitted', 403);
  }

  let endpoint = `${DISCORD_API}/channels/${channelId}/messages?limit=50`;
  if (before) endpoint += `&before=${before}`;
  if (after) endpoint += `&after=${after}`;

  const res = await fetch(endpoint, {
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
  });

  if (!res.ok) return errorResponse('Failed to fetch messages', 502);

  const messages = await res.json();

  // Resolve server nicknames for all unique human authors
  const authorIds = [...new Set(
    messages
      .filter(m => !m.webhook_id)
      .map(m => m.author.id)
  )];

  const nicks = {};
  await Promise.all(authorIds.map(async (id) => {
    const r = await fetch(`${DISCORD_API}/guilds/${env.DISCORD_GUILD_ID}/members/${id}`, {
      headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
    });
    if (r.ok) {
      const member = await r.json();
      nicks[id] = member.nick || null;
    }
  }));

  return jsonResponse({ messages, nicks });
}

async function getOrCreateWebhook(channelId, env) {
  // Check DB for existing webhook
  const existing = await env.DB.prepare(
    'SELECT webhook_id, webhook_token FROM discord_webhooks WHERE channel_id = ?'
  ).bind(channelId).first();

  if (existing) return existing;

  // Create a new webhook via bot
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/webhooks`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: 'occultusHub Chat' }),
  });

  if (!res.ok) return null;

  const webhook = await res.json();

  await env.DB.prepare(
    'INSERT OR REPLACE INTO discord_webhooks (channel_id, webhook_id, webhook_token) VALUES (?, ?, ?)'
  ).bind(channelId, webhook.id, webhook.token).run();

  return { webhook_id: webhook.id, webhook_token: webhook.token };
}

// POST /api/discord/messages (authenticated)
export async function sendMessage(request, env, user) {
  const isMember = await requireFactionMember(user.userId, env);
  if (!isMember) return errorResponse('Faction members only', 403);

  const body = await request.json();
  const { channelId, content } = body;

  if (!channelId || !content?.trim()) return errorResponse('channelId and content required', 400);
  if (content.length > 1800) return errorResponse('Message too long', 400);

  if (!allowedChannelsFor(user).includes(channelId)) {
    return errorResponse('Channel not permitted', 403);
  }

  // Get Discord identity for this user
  const link = await env.DB.prepare(
    'SELECT discord_id, discord_username, discord_avatar FROM discord_links WHERE user_id = ?'
  ).bind(user.userId).first();

  const webhook = await getOrCreateWebhook(channelId, env);
  if (!webhook) return errorResponse('Could not create webhook for channel', 502);

  const avatarUrl = link?.discord_avatar
    ? `https://cdn.discordapp.com/avatars/${link.discord_id}/${link.discord_avatar}.png`
    : undefined;

  // Try to get server nickname, fall back to discord username then torn username
  let displayName = link?.discord_username || user.username;
  if (link?.discord_id) {
    const memberRes = await fetch(
      `${DISCORD_API}/guilds/${env.DISCORD_GUILD_ID}/members/${link.discord_id}`,
      { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } }
    );
    if (memberRes.ok) {
      const member = await memberRes.json();
      if (member.nick) displayName = member.nick;
    }
  }

  const res = await fetch(
    `${DISCORD_API}/webhooks/${webhook.webhook_id}/${webhook.webhook_token}?wait=true`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: content.trim(),
        username: displayName,
        ...(avatarUrl && { avatar_url: avatarUrl }),
      }),
    }
  );

  if (!res.ok) return errorResponse('Failed to send message', 502);

  const msg = await res.json();
  return jsonResponse({ success: true, message: msg });
}
