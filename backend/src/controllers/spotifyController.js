import { SignJWT, jwtVerify } from 'jose';
import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { writeLog } from '../services/logger.js';
import { requireLeadership } from '../middleware/auth.js';

const SPOTIFY_ACCOUNTS = 'https://accounts.spotify.com';
const SPOTIFY_API = 'https://api.spotify.com/v1';
const SCOPES = 'playlist-modify-public playlist-modify-private';

// In-isolate token caches — cheap best-effort, safe to miss (we just re-fetch).
let appToken = { value: null, expiresAt: 0 };
let jukeboxToken = { value: null, expiresAt: 0, scope: null };

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
  jukeboxToken = { value: j.access_token, expiresAt: Date.now() + (j.expires_in - 60) * 1000, scope: j.scope || jukeboxToken.scope };
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

// GET /api/admin/spotify/diagnose — confirms the jukebox account can actually
// write to the configured playlist (the #1 cause of a 403 on add is that the
// playlist isn't owned by the account that was authorized).
export async function diagnose(request, env) {
  const cfg = await getConfig(env);
  const out = {
    secretSet: !!env.SPOTIFY_CLIENT_SECRET,
    clientIdSet: !!cfg?.client_id,
    playlistId: cfg?.playlist_id || null,
    jukeboxLinked: !!cfg?.refresh_token,
    jukebox: null,
    playlist: null,
    canModify: false,
    problem: null,
  };
  try {
    const token = await getJukeboxToken(env, cfg);
    const meRes = await fetch(`${SPOTIFY_API}/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (meRes.ok) {
      const me = await meRes.json();
      out.jukebox = { id: me.id, name: me.display_name, product: me.product };
      out.grantedScope = jukeboxToken.scope || null;
    } else {
      out.problem = `Could not read the jukebox account (${meRes.status}) — re-authorize.`;
      return jsonResponse(out);
    }
    const plRes = await fetch(
      `${SPOTIFY_API}/playlists/${cfg.playlist_id}?fields=name,public,collaborative,owner(id,display_name)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (plRes.ok) {
      const p = await plRes.json();
      out.playlist = { name: p.name, public: p.public, collaborative: p.collaborative, ownerId: p.owner?.id, ownerName: p.owner?.display_name };
      const owns = p.owner?.id === out.jukebox.id || p.collaborative === true;
      if (!owns) {
        out.problem = `The playlist is owned by "${p.owner?.display_name || p.owner?.id}", but you authorized "${out.jukebox.name || out.jukebox.id}". Re-authorize while logged into the account that owns the playlist, or use a playlist that account owns.`;
      } else {
        // Ownership is fine — do a REAL add + remove of a known-good track
        // and report the raw Spotify response, since "add items" 403s
        // independently of "change details" succeeding.
        const TEST_URI = 'spotify:track:4cOdK2wGLETKBW3PvgPWqT'; // Never Gonna Give You Up — available everywhere
        const r = await addUriToPlaylist(token, cfg.playlist_id, TEST_URI);
        out.writeTest = { status: r.status, ok: r.ok, form: r.form, body: String(r.detail || '').slice(0, 400) };
        out.canModify = r.ok;
        if (r.ok) {
          await fetch(`${SPOTIFY_API}/playlists/${cfg.playlist_id}/tracks`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ tracks: [{ uri: TEST_URI }] }),
          }).catch(() => {});
        } else if (r.status === 403) {
          out.problem = 'Reads and playlist-detail edits work, but Spotify returns a generic 403 "Forbidden" on adding tracks. '
            + 'This is a Spotify Development-Mode restriction on write operations, not a config problem. Fix: on the Spotify dashboard, '
            + 'open the app → Settings → User Management and add the jukebox account (name + the email on that Spotify account), then Re-authorize. '
            + 'If that still fails, request "Extended Quota Mode" for the app.';
        } else {
          out.problem = `Adding a track returned ${r.status} (${r.form} form): ${String(r.detail || '').slice(0, 300) || '(empty body)'}`;
        }
      }
    } else {
      out.problem = `Could not read the playlist (${plRes.status}) — check the playlist ID; it must be public.`;
    }
  } catch (e) {
    out.problem = e.message || 'Diagnostic failed';
  }
  return jsonResponse(out);
}

// Pull { status, message } out of a Spotify error response for surfacing.
async function spotifyErr(res) {
  try {
    const j = await res.json();
    return j?.error?.message || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

// Add one track URI to the playlist. Spotify documents this endpoint at both
// /tracks (historical) and /items (current docs), and accepts the URIs in the
// JSON body OR as a query param — enforcement differs between them (the
// /tracks + JSON-body combo 403s for some apps). Try each combination, stop
// on the first success, and remember which form worked for this isolate so
// later adds don't re-pay the failed attempts. Returns { ok, status, detail, form }.
let workingAddForm = null;

async function addUriToPlaylist(token, playlistId, uri) {
  const ALL = [
    { form: 'tracks+body',  path: 'tracks', body: true },
    { form: 'tracks+query', path: 'tracks', body: false },
    { form: 'items+body',   path: 'items',  body: true },
    { form: 'items+query',  path: 'items',  body: false },
  ];
  const attempts = workingAddForm
    ? [...ALL.filter(a => a.form === workingAddForm), ...ALL.filter(a => a.form !== workingAddForm)]
    : ALL;
  let last = { ok: false, status: 0, detail: '', form: 'none' };
  let firstMeaningful = null; // prefer a 403/other over a 404 from the /items path guess
  for (const a of attempts) {
    const url = a.body
      ? `${SPOTIFY_API}/playlists/${playlistId}/${a.path}`
      : `${SPOTIFY_API}/playlists/${playlistId}/${a.path}?uris=${encodeURIComponent(uri)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: a.body
        ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        : { Authorization: `Bearer ${token}` },
      body: a.body ? JSON.stringify({ uris: [uri] }) : undefined,
    });
    if (res.ok) { workingAddForm = a.form; return { ok: true, status: res.status, form: a.form }; }
    last = { ok: false, status: res.status, detail: (await res.text()) || last.detail, form: a.form };
    if (res.status !== 404 && !firstMeaningful) firstMeaningful = last;
    // A non-permission error (bad id, rate limit) won't be fixed by another form
    if (res.status !== 403 && res.status !== 404) return last;
  }
  return firstMeaningful || last;
}

// Remove one URI from the playlist — same /tracks vs /items tolerance.
async function removeUriFromPlaylist(token, playlistId, uri) {
  let last = { ok: false, status: 0, detail: '' };
  for (const path of ['tracks', 'items']) {
    const res = await fetch(`${SPOTIFY_API}/playlists/${playlistId}/${path}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracks: [{ uri }] }),
    });
    if (res.ok) return { ok: true, status: res.status };
    last = { ok: false, status: res.status, detail: (await res.text()) || last.detail };
    if (res.status !== 403 && res.status !== 404) return last;
  }
  return last;
}

// The set of track/episode URIs currently on the real playlist (best effort).
async function livePlaylistUriSet(token, playlistId) {
  try {
    const uris = await getAllPlaylistUris(token, playlistId);
    return new Set(uris);
  } catch {
    return null;
  }
}

// GET /api/admin/spotify/submissions — cross-checked against the live playlist
// so tracks removed manually in Spotify show as gone here too.
export async function getAdminSubmissions(request, env) {
  const cfg = await getConfig(env);
  const { results } = await env.DB.prepare(
    `SELECT id, track_uri, track_name, artist, album_art, added_by_username, added_by_torn_id,
            created_at, removed, removed_by
     FROM spotify_submissions ORDER BY created_at DESC LIMIT 200`
  ).all();
  const rows = results || [];

  let liveSet = null;
  if (cfg?.refresh_token && cfg?.playlist_id) {
    try {
      const token = await getJukeboxToken(env, cfg);
      liveSet = await livePlaylistUriSet(token, cfg.playlist_id);
    } catch { /* leave liveSet null — just don't annotate */ }
  }

  // Reconcile: a not-removed row whose URI is no longer on the playlist was
  // pulled manually in Spotify — mark it removed so moderation stays honest.
  const drifted = [];
  const out = rows.map(r => {
    const onPlaylist = liveSet ? liveSet.has(r.track_uri) : null;
    if (r.removed === 0 && onPlaylist === false) drifted.push(r.id);
    return { ...r, onPlaylist, removed: r.removed === 0 && onPlaylist === false ? 1 : r.removed };
  });
  if (drifted.length) {
    await env.DB.prepare(
      `UPDATE spotify_submissions SET removed = 1, removed_by = 'spotify' WHERE id IN (${drifted.map(() => '?').join(',')})`
    ).bind(...drifted).run();
  }

  return jsonResponse({ submissions: out });
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
    const r = await addUriToPlaylist(token, cfg.playlist_id, uri);
    if (!r.ok) {
      await writeLog(env, {
        category: 'api_error', level: 'warn', event: 'spotify_add_rejected',
        message: `Spotify add rejected (${r.status}, ${r.form} form): ${String(r.detail || '').slice(0, 200)}`,
        username: user.username,
      });
      return errorResponse(
        r.status === 403
          ? `Spotify won't let the jukebox add tracks (403). This is a Spotify app restriction — an admin needs to check Admin → Music → Run diagnostic.`
          : `Spotify rejected the add (${r.status}).`,
        502,
      );
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
    const r = await removeUriFromPlaylist(token, cfg.playlist_id, row.track_uri);
    // 404 = already gone from Spotify (e.g. removed manually there) — treat as success
    if (!r.ok && r.status !== 404) {
      return errorResponse(`Spotify rejected the removal (${r.status}).`, 502);
    }
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

// ─── shuffle: reorder the real playlist so the embed plays it randomly ───────

async function getAllPlaylistUris(token, playlistId) {
  const uris = [];
  let url = `${SPOTIFY_API}/playlists/${playlistId}/tracks?fields=items(track(uri,type)),next&limit=100`;
  while (url && uris.length < 500) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Could not read the playlist (${res.status})`);
    const j = await res.json();
    for (const it of (j.items || [])) {
      const u = it.track?.uri;
      if (u && /^spotify:(track|episode):/.test(u)) uris.push(u);
    }
    url = j.next || null;
  }
  return uris;
}

// PUT replace (first ≤100) then POST-append the rest, tolerating the
// /tracks vs /items enforcement quirk.
async function replacePlaylistUris(token, playlistId, uris) {
  const first = uris.slice(0, 100);
  let done = false;
  for (const path of ['tracks', 'items']) {
    const res = await fetch(`${SPOTIFY_API}/playlists/${playlistId}/${path}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: first }),
    });
    if (res.ok) { done = true; break; }
    if (res.status !== 403 && res.status !== 404) {
      throw new Error(`Spotify rejected the reorder (${res.status})`);
    }
  }
  if (!done) throw new Error('Spotify rejected the reorder (403)');
  for (let i = 100; i < uris.length; i += 100) {
    const r = await addBatch(token, playlistId, uris.slice(i, i + 100));
    if (!r.ok) throw new Error(`Reorder append failed (${r.status})`);
  }
}

async function addBatch(token, playlistId, uris) {
  for (const path of ['tracks', 'items']) {
    const res = await fetch(`${SPOTIFY_API}/playlists/${playlistId}/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris }),
    });
    if (res.ok) return { ok: true };
    if (res.status !== 403 && res.status !== 404) return { ok: false, status: res.status };
  }
  return { ok: false, status: 403 };
}

// POST /api/spotify/shuffle — any logged-in user, globally throttled
export async function shuffle(request, env, user) {
  let cfg;
  try { cfg = await requireEnabled(env); } catch { return errorResponse('Music is disabled', 403); }

  if (cfg.last_shuffled_at) {
    const ageMs = Date.now() - new Date(cfg.last_shuffled_at.replace(' ', 'T') + 'Z').getTime();
    if (ageMs < 90_000) {
      return errorResponse('The playlist was just shuffled — give it a minute', 429);
    }
  }

  try {
    const token = await getJukeboxToken(env, cfg);
    const uris = await getAllPlaylistUris(token, cfg.playlist_id);
    if (uris.length < 3) return errorResponse('Not enough tracks to shuffle', 400);

    for (let i = uris.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [uris[i], uris[j]] = [uris[j], uris[i]];
    }
    await replacePlaylistUris(token, cfg.playlist_id, uris);

    await env.DB.prepare('UPDATE spotify_config SET last_shuffled_at = CURRENT_TIMESTAMP WHERE id = 1').run();
    await writeLog(env, {
      category: 'game', event: 'spotify_shuffled',
      message: `${user.username} shuffled the playlist (${uris.length} tracks)`,
      torn_user_id: user.tornUserId, username: user.username,
    });
    return jsonResponse({ ok: true, count: uris.length });
  } catch (e) {
    return errorResponse(e.message || 'Shuffle failed', 502);
  }
}
