import { generateToken } from '../middleware/auth.js';
import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { logInfo, logWarn, logError } from '../services/logger.js';

const TORN_API_BASE = 'https://api.torn.com/v2';

export async function login(request, env) {
  try {
    const { apiKey } = await request.json();

    if (!apiKey) {
      return errorResponse('API key is required', 400);
    }

    // Validate API key and fetch all needed data in two parallel requests
    let tornProfile, tornFactionData, calendarStartTime = null;
    try {
      const headers = { Authorization: `ApiKey ${apiKey}` };
      const [userRes, keyRes] = await Promise.all([
        fetch(`${TORN_API_BASE}/user?selections=profile,faction,calendar&comment=OccHub`, { headers }),
        fetch(`${TORN_API_BASE}/key/info?comment=OccHub`, { headers }),
      ]);

      if (!userRes.ok) {
        return errorResponse('Invalid API key', 401);
      }
      const userRaw = await userRes.json();
      if (userRaw.error) {
        return errorResponse('Invalid API key', 401);
      }
      tornProfile = userRaw.profile;
      tornFactionData = userRaw.faction ?? null;
      const rawTime = userRaw.calendar?.start_time ?? null;
      if (rawTime) calendarStartTime = rawTime.replace(/\s*TCT$/i, '').trim();

      if (keyRes.ok) {
        const keyRaw = await keyRes.json();
        const level = keyRaw?.info?.access?.level ?? 0;
        if (level < 3) {
          return errorResponse('Your API key must be Limited Access (level 3) or higher to use this site', 403);
        }
      }
    } catch (err) {
      console.error('Torn API fetch error:', err);
      await logError(env, { category: 'api_error', event: 'torn_auth_failed', message: `Torn API auth failed: ${err.message}` });
      return errorResponse('Invalid API key', 401);
    }

    const tornUserId = tornProfile.id;
    const tornUsername = tornProfile.name;
    const tornFactionId = tornFactionData?.id ?? tornProfile.faction_id ?? null;
    const tornFactionPosition = tornFactionData?.position ?? null;
    const tornImage = tornProfile.image ?? null;

    // Encrypt API key (base64 encoding)
    const encryptedApiKey = btoa(apiKey);

    // Check if user exists in database
    const existingUser = await env.DB.prepare(
      'SELECT * FROM users WHERE torn_user_id = ?'
    )
      .bind(tornUserId)
      .first();

    let user;
    if (existingUser) {
      user = existingUser;
      await env.DB.prepare(
        `UPDATE users
         SET username = ?,
             faction_id = ?,
             faction_position = ?,
             image_url = ?,
             api_key = ?,
             calendar_start_time = COALESCE(?, calendar_start_time),
             last_login = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
        .bind(tornUsername, tornFactionId, tornFactionPosition, tornImage, encryptedApiKey, calendarStartTime, user.id)
        .run();
      user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
    } else {
      const result = await env.DB.prepare(
        `INSERT INTO users (torn_user_id, username, faction_id, faction_position, image_url, api_key, calendar_start_time)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         RETURNING *`
      )
        .bind(tornUserId, tornUsername, tornFactionId, tornFactionPosition, tornImage, encryptedApiKey, calendarStartTime)
        .first();

      if (!result) {
        return errorResponse('Failed to create user', 500);
      }
      user = result;
    }

    const ipAddress = request.headers.get('cf-connecting-ip') ?? '';
    const userAgent = request.headers.get('user-agent') ?? '';

    await env.DB.prepare(
      'INSERT INTO login_history (user_id, ip_address, user_agent) VALUES (?, ?, ?)'
    )
      .bind(user.id ?? null, ipAddress, userAgent)
      .run();

    await logInfo(env, {
      category: 'auth', event: 'login',
      message: `${user.username} logged in`,
      torn_user_id: user.torn_user_id, username: user.username, faction_id: user.faction_id,
      meta: { ip: request.headers.get('cf-connecting-ip'), isNew: !existingUser },
    });

    // Generate JWT token
    const token = await generateToken(user, env);

    return jsonResponse({
      token,
      user: {
        userId: user.id,
        tornUserId: user.torn_user_id,
        username: user.username,
        factionId: user.faction_id,
        factionPosition: user.faction_position,
        image: user.image_url,
        isAdmin: user.is_admin === 1,
        isOwner: user.is_owner === 1,
        fishingPoints: user.fishing_points || 0,
        runePoints: user.rune_points || 0,
        calendarStartTime: user.calendar_start_time || null,
      },
    });
  } catch (error) {
    console.error('Login error:', error?.message ?? error, error?.stack ?? '');
    await logError(env, { category: 'auth', event: 'login_error', message: `Login threw: ${error?.message ?? String(error)}` }).catch(() => {});
    return errorResponse('Internal server error', 500);
  }
}

export async function session(request, env, user) {
  try {
    if (!user) {
      return errorResponse('No token provided', 401);
    }

    const userData = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
      .bind(user.userId)
      .first();

    if (!userData) {
      return jsonResponse({ valid: false });
    }

    return jsonResponse({
      valid: true,
      user: {
        userId: userData.id,
        tornUserId: userData.torn_user_id,
        username: userData.username,
        factionId: userData.faction_id,
        factionPosition: userData.faction_position,
        image: userData.image_url,
        isAdmin: userData.is_admin === 1,
        isOwner: userData.is_owner === 1,
        fishingPoints: userData.fishing_points || 0,
        lastFishedAt: userData.last_fished_at || null,
        runePoints: userData.rune_points || 0,
        lastRuneCastAt: userData.last_rune_cast_at || null,
        calendarStartTime: userData.calendar_start_time || null,
      },
    });
  } catch (error) {
    console.error('Session error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function logout(request, env, user) {
  return jsonResponse({ message: 'Logged out successfully' });
}

// ── User key sync ──────────────────────────────────────────────────────────────
// Called by daily cron and admin manual trigger.
// Loops all users with stored API keys, checks their current Torn profile,
// and updates username / faction_id / faction_position / image_url if changed.
export async function syncUserKeys(env) {
  const { results: users } = await env.DB.prepare(
    `SELECT id, torn_user_id, username, faction_id, faction_position, image_url, api_key
     FROM users WHERE api_key IS NOT NULL`
  ).all();

  if (!users?.length) return { checked: 0, updated: 0, errors: 0, changes: [] };

  let updated = 0;
  let errors  = 0;
  const changes = [];

  // Process 5 at a time — API calls are IO so CPU limit isn't a concern,
  // but we stay polite to Torn's rate limits.
  const BATCH = 5;
  for (let i = 0; i < users.length; i += BATCH) {
    await Promise.all(users.slice(i, i + BATCH).map(async (u) => {
      try {
        const apiKey = atob(u.api_key);
        const res = await fetch(
          `${TORN_API_BASE}/user?selections=profile,faction&comment=OccHub`,
          { headers: { Authorization: `ApiKey ${apiKey}` } }
        );

        if (!res.ok) {
          errors++;
          await logWarn(env, {
            category: 'cron', event: 'user_key_sync_error',
            message: `Key sync: API error for ${u.username} (${u.torn_user_id}): HTTP ${res.status}`,
            torn_user_id: u.torn_user_id, username: u.username,
          });
          return;
        }

        const raw = await res.json();
        if (raw.error) {
          errors++;
          await logWarn(env, {
            category: 'cron', event: 'user_key_sync_invalid',
            message: `Key sync: Invalid/expired key for ${u.username} (${u.torn_user_id}): ${raw.error.error ?? raw.error}`,
            torn_user_id: u.torn_user_id, username: u.username,
          });
          return;
        }

        const profile     = raw.profile;
        const factionData = raw.faction ?? null;

        const newUsername         = profile.name          ?? u.username;
        const newFactionId        = factionData?.id       ?? profile.faction_id ?? null;
        const newFactionPosition  = factionData?.position ?? null;
        const newImage            = profile.image         ?? null;

        const fieldChanges = [];
        if (newUsername        !== u.username)         fieldChanges.push({ field: 'username',         from: u.username,         to: newUsername });
        if (newFactionId       !== u.faction_id)       fieldChanges.push({ field: 'faction_id',       from: u.faction_id,       to: newFactionId });
        if (newFactionPosition !== u.faction_position) fieldChanges.push({ field: 'faction_position', from: u.faction_position, to: newFactionPosition });
        if (newImage           !== u.image_url)        fieldChanges.push({ field: 'image_url',        from: '(old)',            to: '(new)' });

        if (fieldChanges.length > 0) {
          await env.DB.prepare(
            `UPDATE users SET username = ?, faction_id = ?, faction_position = ?, image_url = ? WHERE id = ?`
          ).bind(newUsername, newFactionId, newFactionPosition, newImage, u.id).run();

          updated++;
          for (const c of fieldChanges) {
            const msg = `Key sync: ${u.username} — ${c.field} updated from ${c.from} to ${c.to}`;
            changes.push(msg);
            await logInfo(env, {
              category: 'cron', event: 'user_key_sync_updated',
              message: msg,
              torn_user_id: u.torn_user_id, username: u.username,
              meta: { field: c.field, from: c.from, to: c.to },
            });
          }
        }
      } catch (err) {
        errors++;
        await logError(env, {
          category: 'cron', event: 'user_key_sync_failed',
          message: `Key sync: Exception for ${u.username}: ${err.message}`,
          torn_user_id: u.torn_user_id, username: u.username,
        });
      }
    }));
  }

  await logInfo(env, {
    category: 'cron', event: 'user_key_sync_complete',
    message: `User key sync complete: ${users.length} checked, ${updated} updated, ${errors} errors`,
    meta: { checked: users.length, updated, errors },
  });

  return { checked: users.length, updated, errors, changes };
}

export async function triggerUserKeySyncAdmin(request, env) {
  try {
    const result = await syncUserKeys(env);
    return jsonResponse({
      message: `User key sync: ${result.checked} checked, ${result.updated} updated, ${result.errors} errors`,
      ...result,
    });
  } catch (err) {
    return errorResponse(`User key sync failed: ${err.message}`, 500);
  }
}
