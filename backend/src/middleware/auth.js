import { jwtVerify, SignJWT } from 'jose';

const LEADERSHIP_ROLES = ['Leader', 'Co-leader', 'Archon', 'High Council', 'Council'];

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

// Check if user has admin role
export async function requireAdmin(user) {
  return user && user.isAdmin === true;
}

// Check if user has leadership or admin role
export async function requireLeadership(user) {
  return user && (user.isLeader === true || user.isAdmin === true);
}

// Generate JWT token for user
export async function generateToken(user, env) {
  const secret = new TextEncoder().encode(env.JWT_SECRET);

  const token = await new SignJWT({
    userId: user.id,
    tornUserId: user.torn_user_id,
    username: user.username,
    isAdmin: user.is_admin === 1 ? true : false,
    isOwner: user.is_owner === 1 ? true : false,
    isLeader: LEADERSHIP_ROLES.includes(user.faction_position) ? true : false,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(secret);

  return token;
}
