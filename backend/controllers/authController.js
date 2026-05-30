import axios from 'axios';
import pool from '../db/pool.js';
import { generateToken } from '../middleware/auth.js';
import config from '../config.js';

export const login = async (req, res, next) => {
  const { apiKey } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: 'API key is required' });
  }

  try {
    // Validate API key with Torn.com
    const tornResponse = await axios.get(
      `${config.tornApi.baseUrl}/user?selections=profile&key=${apiKey}`
    );

    if (tornResponse.status !== 200) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const tornUser = tornResponse.data;

    // Check if user exists in database, if not create them
    const userResult = await pool.query(
      'SELECT * FROM users WHERE torn_user_id = $1',
      [tornUser.user_id]
    );

    let user;
    if (userResult.rows.length > 0) {
      user = userResult.rows[0];
      // Update last login
      await pool.query(
        'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
        [user.id]
      );
    } else {
      // Create new user
      const createResult = await pool.query(
        `INSERT INTO users (torn_user_id, username, faction_id, faction_position, image_url)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          tornUser.user_id,
          tornUser.name,
          tornUser.faction ? tornUser.faction.faction_id : null,
          tornUser.job ? tornUser.job.position : null,
          tornUser.image || null,
        ]
      );
      user = createResult.rows[0];
    }

    // Log login
    const ipAddress = req.ip || req.connection.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    await pool.query(
      'INSERT INTO login_history (user_id, ip_address, user_agent) VALUES ($1, $2, $3)',
      [user.id, ipAddress, userAgent]
    );

    // Generate JWT token
    const token = generateToken(user);

    // Return user info with token
    res.json({
      token,
      user: {
        userId: user.id,
        tornUserId: user.torn_user_id,
        username: user.username,
        factionId: user.faction_id,
        factionPosition: user.faction_position,
        image: user.image_url,
        isAdmin: user.is_admin,
      },
    });
  } catch (err) {
    if (err.response?.status === 400 || err.response?.status === 401) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    next(err);
  }
};

export const session = async (req, res, next) => {
  try {
    const user = await pool.query('SELECT * FROM users WHERE id = $1', [
      req.user.userId,
    ]);

    if (user.rows.length === 0) {
      return res.status(200).json({ valid: false });
    }

    const userData = user.rows[0];
    res.json({
      valid: true,
      user: {
        userId: userData.id,
        tornUserId: userData.torn_user_id,
        username: userData.username,
        factionId: userData.faction_id,
        factionPosition: userData.faction_position,
        image: userData.image_url,
        isAdmin: userData.is_admin,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const logout = (req, res) => {
  res.json({ message: 'Logged out successfully' });
};
