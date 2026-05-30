import jwt from 'jsonwebtoken';
import config from '../config.js';

export const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

export const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user.id,
      tornUserId: user.torn_user_id,
      username: user.username,
      isAdmin: user.is_admin,
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
};
