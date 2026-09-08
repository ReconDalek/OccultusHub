import { SignJWT, jwtVerify } from 'jose';
import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { writeLog } from '../services/logger.js';
import { requireLeadership } from '../middleware/auth.js';

const SPOTIFY_ACCOUNTS = 'https://accounts.spotify.com';
const SPOTIFY_API = 'https://api.spotify.com/v1';
const SCOPES = 'playlist-modify-public playlist-modify-private';

// In-isolate token caches — cheap best-effort, safe to miss (we just re-fetch).
let appToken = { value: null, expiresAt: 0 };
let jukeboxToken = { value: null, expiresAt: 0 };

// ─── config ──────────────────────────────────────────────────────────────────

async function getConfig(env) {
  return env.DB.prepare('SELECT * FROM spotify_config WHERE id = 1').first();
}

function redirectUri(request, env) {
  if (env.SPOTIFY_REDIRECT_URI) return env.SPOTIFY_REDIRECT_URI;
  return `${new URL(request.url).origin}/api/spotify/callback`;
}

// ─── tokens ──────────────────────────────────────────────────────────────────

// Client-credentials token — used for search + reading the playlist. No user.
async function getAppToken(env, cfg) {
  if (appToken.value && Date.now() < appToken.expiresAt) return appToken.value;
  if (!cfg?.client_id || !env.SPOTIFY_CLIENT_SECRET) {
    throw new Error('Spotify app credentials are not configured');
  }
  const res = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + btoa(`${cfg.client_id}:${env.SPOTIFY_CLIENT_SECRET}`),
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  });
  if (!res.ok) throw new Error('Spotify client-credentials auth failed');
  const j = await res.json();
  appToken = { value: j.access_token, expiresAt: Date.now() + (j.expires_in - 60) * 1000 };
  return appToken.value;
}

// Jukebox-account access token, derived from the stored refresh token — used
// for playlist writes.
async function getJukeboxToken(env, cfg) {
  if (jukeboxToken.value && Date.now() < jukeboxToken.expiresAt) return jukeboxToken.value;
  if (!cfg?.refresh_token || !cfg?.client_id || !env.SPOTIFY_CLIENT_SECRET) {
    throw new Error('Spotify jukebox account is not linked');
  }
  const res = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + btoa(`${cfg.client_id}:${env.SPOTIFY_CLIENT_SECRET}`),
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: cfg.refresh_token }),
  });
  if (!res.ok) throw new Error('Spotify jukebox token refresh failed');
  const j = await res.json();
  jukeboxToken = { value: j.access_token, expiresAt: Date.now() + (j.expires_in - 60) * 1000 };
  // Spotify occasionally rotates the refresh token
  if (j.refresh_token && j.refresh_token !== cfg.refresh_token) {
    await env.DB.prepare('UPDATE spotify_config SET refresh_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1')
      .bind(j.refresh_token).run();
  }
  return jukeboxToken.value;
}

// ─── OAuth: one-time jukebox link (admin) ────────────────────────────────────

async function stateToken(userId, env) {
  const secret = new TextEncoder().encode(env.JWT_SECRET + '_spotify_state');
  return new SignJWT({ userId }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('10m').sign(secret);
}
async function verifyState(state, env) {
  try {
    const secret = new TextEncoder().encode(env.JWT_SECRET + '_spotify_state');
    const { payload } = await jwtVerify(state, secret);
    return payload.userId;
  } catch { return null; }
}

// GET /api/admin/spotify/auth-url
export async function getAuthUrl(request, env, user) {
  const cfg = await getConfig(env);
  if (!cfg?.client_id) return errorResponse('Set the Spotify Client ID first', 400);
  const params = new URLSearchParams({
    client_id: cfg.client_id,
    response_type: 'code',
    redirect_uri: redirectUri(request, env),
    scope: SCOPES,
    state: await stateToken(user.userId, env),
    show_dialog: 'true',
  });
  return jsonResponse({ url: `${SPOTIFY_ACCOUNTS}/authorize?${params}` });
}

// GET /api/spotify/callback (public — Spotify redirects here)
export async function handleCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const dest = `${env.CORS_ORIGIN}/admin?tab=music`;

  if (url.searchParams.get('error') || !code || !state) {
    return Response.redirect(`${dest}&spotify=error`, 302);
  }
  const userId = await verifyState(state, env);
  if (!userId) return Response.redirect(`${dest}&spotify=error`, 302);

  const cfg = await getConfig(env);
  if (!cfg?.client_id || !env.SPOTIFY_CLIENT_SECRET) {
    return Response.redirect(`${dest}&spotify=error`, 302);
  }

  const tokenRes = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + btoa(`${cfg.client_id}:${env.SPOTIFY_CLIENT_SECRET}`),
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(request, env),
    }),
  });
  if (!tokenRes.ok) return Response.redirect(`${dest}&spotify=error`, 302);
  const tokens = await tokenRes.json();
  if (!tokens.refresh_token) return Response.redirect(`${dest}&spotify=error`, 302);

  let displayName = null;
  try {
    const me = await fetch(`${SPOTIFY_API}/me`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    if (me.ok) displayName = (await me.json()).display_name || null;
  } catch { /* non-fatal */ }

  await env.DB.prepare(
    'UPDATE spotify_config SET refresh_token = ?, jukebox_display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1'
  ).bind(tokens.refresh_token, displayName).run();
  jukeboxToken = { value: null, expiresAt: 0 };

  await writeLog(env, { category: 'admin', event: 'spotify_jukebox_linked', message: `Spotify jukebox linked (${displayName || 'unknown'})` });
  return Response.redirect(`${dest}&spotify=linked`, 302);
}

// ─── status / config (admin) ────────────────────────────────────────────────

// GET /api/spotify/status  (any logged-in user)
export async function getStatus(request, env, user) {
  const cfg = await getConfig(env);
  const configured = !!(cfg?.client_id && env.SPOTIFY_CLIENT_SECRET && cfg?.playlist_id && cfg?.refresh_token);
  return jsonResponse({
    enabled: cfg?.enabled === 1,
    configured,
    playlistId: cfg?.enabled === 1 && configured ? cfg.playlist_id : null,
    addLimitPerDay: cfg?.add_limit_per_day ?? 5,
  });
}

// GET /api/admin/spotify/config
export async function getAdminConfig(request, env) {
  const cfg = await getConfig(env);
  const { results } = await env.DB.prepare(
    'SELECT COUNT(*) AS total, SUM(CASE WHEN removed = 0 THEN 1 ELSE 0 END) AS active FROM spotify_submissions'
  ).all();
  return jsonResponse({
    enabled: cfg?.enabled === 1,
    clientId: cfg?.client_id || '',
    playlistId: cfg?.playlist_id || '',
    addLimitPerDay: cfg?.add_limit_per_day ?? 5,
    secretSet: !!env.SPOTIFY_CLIENT_SECRET,
    jukeboxLinked: !!cfg?.refresh_token,
    jukeboxName: cfg?.jukebox_display_name || null,
    submissionCounts: results?.[0] || { total: 0, active: 0 },
  });
}

// PUT /api/admin/spotify/config
export async function updateAdminConfig(request, env) {
  const body = await request.json();
  const fields = [];
  const binds = [];
  if (body.enabled !== undefined)     { fields.push('enabled = ?');           binds.push(body.enabled ? 1 : 0); }
  if (body.clientId !== undefined)    { fields.push('client_id = ?');         binds.push(String(body.clientId).trim() || null); }
  if (body.playlistId !== undefined)  { fields.push('playlist_id = ?');       binds.push(parsePlaylistId(body.playlistId)); }
  if (body.addLimitPerDay !== undefined) {
    const n = Math.max(1, Math.min(50, parseInt(body.addLimitPerDay) || 5));
    fields.push('add_limit_per_day = ?'); binds.push(n);
  }
  if (!fields.length) return errorResponse('Nothing to update', 400);
  fields.push('updated_at = CURRENT_TIMESTAMP');
  await env.DB.prepare(`UPDATE spotify_config SET ${fields.join(', ')} WHERE id = 1`).bind(...binds).run();
  appToken = { value: null, expiresAt: 0 };
  return getAdminConfig(request, env);
}

// Accepts a raw id, a spotify: URI, or an open.spotify.com URL
function parsePlaylistId(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  const uri = s.match(/playlist[:/]([A-Za-z0-9]+)/);
  if (uri) return uri[1];
  return s.replace(/[^A-Za-z0-9]/g, '') || null;
}

// GET /api/admin/spotify/submissions
export async function getAdminSubmissions(request, env) {
  const { results } = await env.DB.prepare(
    `SELECT id, track_uri, track_name, artist, album_art, added_by_username, added_by_torn_id,
            created_at, removed, removed_by
     FROM spotify_submissions ORDER BY created_at DESC LIMIT 200`
  ).all();
  return jsonResponse({ submissions: results || [] });
}

// ─── member: search / playlist / add / remove ───────────────────────────────

async function requireEnabled(env) {
  const cfg = await getConfig(env);
  if (cfg?.enabled !== 1) throw new Error('disabled');
  return cfg;
}

// GET /api/spotify/search?q=
export async function search(request, env, user) {
  let cfg;
  try { cfg = await requireEnabled(env); } catch { return errorResponse('Music is disabled', 403); }
  const q = new URL(request.url).searchParams.get('q')?.trim();
  if (!q) return jsonResponse({ tracks: [] });
  try {
    const token = await getAppToken(env, cfg);
    const res = await fetch(
      `${SPOTIFY_API}/search?type=track&limit=8&q=${encodeURIComponent(q)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return errorResponse('Spotify search failed', 502);
    const j = await res.json();
    const tracks = (j.tracks?.items || []).map(t => ({
      id: t.id,
      uri: t.uri,
      name: t.name,
      artist: (t.artists || []).map(a => a.name).join(', '),
      albumArt: t.album?.images?.[t.album.images.length - 1]?.url || null,
      durationMs: t.duration_ms,
    }));
    return jsonResponse({ tracks });
  } catch (e) {
    return errorResponse(e.message || 'Search failed', 500);
  }
}

// GET /api/spotify/playlist — our submissions (attribution) + playlist meta
export async function getPlaylist(request, env, user) {
  let cfg;
  try { cfg = await requireEnabled(env); } catch { return errorResponse('Music is disabled', 403); }

  const { results } = await env.DB.prepare(
    `SELECT id, track_uri, track_id, track_name, artist, album_art, added_by_username, added_by_user_id, created_at
     FROM spotify_submissions WHERE removed = 0 ORDER BY created_at DESC LIMIT 60`
  ).all();

  let meta = null;
  try {
    const token = await getAppToken(env, cfg);
    const res = await fetch(
      `${SPOTIFY_API}/playlists/${cfg.playlist_id}?fields=name,external_urls.spotify,images,tracks.total`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.ok) {
      const p = await res.json();
      meta = { name: p.name, url: p.external_urls?.spotify, image: p.images?.[0]?.url || null, total: p.tracks?.total ?? null };
    }
  } catch { /* meta is optional */ }

  return jsonResponse({
    playlistId: cfg.playlist_id,
    meta,
    submissions: (results || []).map(r => ({ ...r, mine: r.added_by_user_id === user.userId })),
  });
}

// POST /api/spotify/add  { id, uri, name, artist, albumArt }
export async function addTrack(request, env, user) {
  let cfg;
  try { cfg = await requireEnabled(env); } catch { return errorResponse('Music is disabled', 403); }

  const { id, uri, name, artist, albumArt } = await request.json();
  if (!uri || !/^spotify:track:[A-Za-z0-9]+$/.test(uri) || !name) {
    return errorResponse('Invalid track', 400);
  }

  // already on the playlist?
  const dupe = await env.DB.prepare(
    'SELECT id FROM spotify_submissions WHERE track_id = ? AND removed = 0'
  ).bind(id).first();
  if (dupe) return errorResponse('That track is already on the playlist', 409);

  // per-user daily cap
  const limit = cfg.add_limit_per_day ?? 5;
  const { results: recent } = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM spotify_submissions
     WHERE added_by_user_id = ? AND created_at > datetime('now', '-1 day')`
  ).bind(user.userId).all();
  if ((recent?.[0]?.n ?? 0) >= limit) {
    return errorResponse(`You've hit the ${limit}-track daily limit — try again tomorrow`, 429);
  }

  try {
    const token = await getJukeboxToken(env, cfg);
    const res = await fetch(`${SPOTIFY_API}/playlists/${cfg.playlist_id}/tracks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [uri] }),
    });
    if (!res.ok) {
      const txt = await res.text();
      return errorResponse(`Spotify rejected the add (${res.status})`, 502);
    }
  } catch (e) {
    return errorResponse(e.message || 'Add failed', 500);
  }

  await env.DB.prepare(
    `INSERT INTO spotify_submissions
       (track_uri, track_id, track_name, artist, album_art, added_by_user_id, added_by_username, added_by_torn_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(uri, id, name, artist || '', albumArt || null, user.userId, user.username, user.tornUserId || null).run();

  await writeLog(env, {
    category: 'game', event: 'spotify_track_added',
    message: `${user.username} added "${name}" — ${artist || ''}`,
    torn_user_id: user.tornUserId, username: user.username,
  });

  return getPlaylist(request, env, user);
}

// DELETE /api/spotify/track  { submissionId }
export async function removeTrack(request, env, user) {
  let cfg;
  try { cfg = await requireEnabled(env); } catch { return errorResponse('Music is disabled', 403); }

  const { submissionId } = await request.json();
  const row = await env.DB.prepare(
    'SELECT * FROM spotify_submissions WHERE id = ? AND removed = 0'
  ).bind(submissionId).first();
  if (!row) return errorResponse('Track not found', 404);

  const isLeader = await requireLeadership(user, env);
  if (row.added_by_user_id !== user.userId && !isLeader) {
    return errorResponse('You can only remove tracks you added', 403);
  }

  try {
    const token = await getJukeboxToken(env, cfg);
    const res = await fetch(`${SPOTIFY_API}/playlists/${cfg.playlist_id}/tracks`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracks: [{ uri: row.track_uri }] }),
    });
    if (!res.ok) return errorResponse(`Spotify rejected the removal (${res.status})`, 502);
  } catch (e) {
    return errorResponse(e.message || 'Removal failed', 500);
  }

  await env.DB.prepare(
    'UPDATE spotify_submissions SET removed = 1, removed_by = ? WHERE id = ?'
  ).bind(user.username, submissionId).run();

  await writeLog(env, {
    category: 'game', event: 'spotify_track_removed',
    message: `${user.username} removed "${row.track_name}"`,
    torn_user_id: user.tornUserId, username: user.username,
  });

  // admin moderation view calls this too — return the fresh member view
  return getPlaylist(request, env, user);
}
