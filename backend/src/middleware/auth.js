import { jwtVerify, SignJWT } from 'jose';

const LEADERSHIP_ROLES = ['Leader', 'Co-leader', 'Archon', 'High Council', 'Council'];
const ALLOWED_FACTION_IDS = [33097, 9728, 9171];

// Verify JWT token from request headers
export async function verifyToken(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '');
  try {
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}

// Whether a user row's temporary access_override is currently in effect
export function isOverrideActive(userRow) {
  if (!userRow?.access_override) return false;
  if (!userRow.access_override_expires_at) return true;
  const expiresAt = new Date(userRow.access_override_expires_at.replace(' ', 'T') + 'Z').getTime();
  return Date.now() < expiresAt;
}

// Computes real + override-derived access flags from a fresh `users` row.
// Never derived from the user's own API key/faction data for the override part —
// it's purely a manual admin grant (used for our members visiting other factions).
// The owner always has full access regardless of any of the above.
export function computeEffectiveAccess(userRow) {
  const isOwner = userRow.is_owner === 1;
  const realIsFactionMember = ALLOWED_FACTION_IDS.includes(Number(userRow.faction_id));
  const realIsLeader = realIsFactionMember && LEADERSHIP_ROLES.includes(userRow.faction_position);
  const overrideActive = isOverrideActive(userRow);

  return {
    isFactionMember: isOwner || realIsFactionMember || overrideActive,
    isLeader: isOwner || realIsLeader || (overrideActive && userRow.access_override === 'leader'),
    accessOverride: overrideActive
      ? {
          level: userRow.access_override,
          expiresAt: userRow.access_override_expires_at || null,
          note: userRow.access_override_note || null,
        }
      : null,
  };
}

// Check if user has admin role — owner always has full access
export async function requireAdmin(user) {
  return user && (user.isAdmin === true || user.isOwner === true);
}

// Check if user has leadership or admin role — also honours a temporary
// leader access_override granted from the admin Users page, even if the
// JWT was issued before the override was set. Owner always has full access.
export async function requireLeadership(user, env) {
  if (!user) return false;
  if (user.isLeader === true || user.isAdmin === true || user.isOwner === true) return true;

  const row = await env.DB.prepare(
    'SELECT access_override, access_override_expires_at FROM users WHERE id = ?'
  ).bind(user.userId).first();

  return !!row && isOverrideActive(row) && row.access_override === 'leader';
}

// Generate JWT token for user
export async function generateToken(user, env) {
  const secret = new TextEncoder().encode(env.JWT_SECRET);

  const token = await new SignJWT({
    userId: user.id,
    tornUserId: user.torn_user_id,
    username: user.username,
    isAdmin: (user.is_admin === 1 || user.is_owner === 1) ? true : false,
    isOwner: user.is_owner === 1 ? true : false,
    isLeader: (user.is_owner === 1 || LEADERSHIP_ROLES.includes(user.faction_position)) ? true : false,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(secret);

  return token;
}
