import pool from '../db/pool.js';

// Get all users with their login history summary
export const getAllUsers = async (req, res, next) => {
  const { search } = req.query;

  try {
    let query = `
      SELECT
        u.id,
        u.torn_user_id,
        u.username,
        u.faction_id,
        u.faction_position,
        u.image_url,
        u.is_admin,
        u.created_at,
        u.last_login,
        COUNT(lh.id) as login_count
      FROM users u
      LEFT JOIN login_history lh ON u.id = lh.user_id
    `;

    const params = [];
    if (search) {
      query += ' WHERE u.username ILIKE $1';
      params.push(`%${search}%`);
      query += ' GROUP BY u.id ORDER BY u.username';
    } else {
      query += ' GROUP BY u.id ORDER BY u.created_at DESC';
    }

    const result = await pool.query(query, params);

    res.json({
      users: result.rows,
      total: result.rows.length,
    });
  } catch (err) {
    next(err);
  }
};

// Get single user's login history
export const getUserHistory = async (req, res, next) => {
  const { tornUserId } = req.params;

  try {
    const userResult = await pool.query(
      'SELECT id FROM users WHERE torn_user_id = $1',
      [tornUserId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = userResult.rows[0].id;

    const historyResult = await pool.query(
      `SELECT login_at, ip_address, user_agent
       FROM login_history
       WHERE user_id = $1
       ORDER BY login_at DESC
       LIMIT 50`,
      [userId]
    );

    res.json({
      logins: historyResult.rows,
      total: historyResult.rows.length,
    });
  } catch (err) {
    next(err);
  }
};

// Grant admin access
export const grantAdmin = async (req, res, next) => {
  const { tornUserId } = req.params;
  const { reason } = req.body;

  try {
    const userResult = await pool.query(
      'SELECT id FROM users WHERE torn_user_id = $1',
      [tornUserId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = userResult.rows[0].id;

    await pool.query('BEGIN');

    // Update is_admin flag
    await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [userId]);

    // Log the grant
    await pool.query(
      `INSERT INTO admin_users (user_id, granted_by, reason)
       VALUES ($1, $2, $3)`,
      [userId, req.user.userId, reason || null]
    );

    await pool.query('COMMIT');

    res.json({ message: 'Admin access granted' });
  } catch (err) {
    await pool.query('ROLLBACK').catch(() => {});
    next(err);
  }
};

// Revoke admin access
export const revokeAdmin = async (req, res, next) => {
  const { tornUserId } = req.params;
  const { reason } = req.body;

  try {
    const userResult = await pool.query(
      'SELECT id FROM users WHERE torn_user_id = $1',
      [tornUserId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = userResult.rows[0].id;

    await pool.query('BEGIN');

    // Update is_admin flag
    await pool.query('UPDATE users SET is_admin = false WHERE id = $1', [userId]);

    // Log the revoke
    await pool.query(
      `UPDATE admin_users
       SET revoked_at = CURRENT_TIMESTAMP, revoked_by = $1, reason = $2
       WHERE user_id = $3 AND revoked_at IS NULL`,
      [req.user.userId, reason || null, userId]
    );

    await pool.query('COMMIT');

    res.json({ message: 'Admin access revoked' });
  } catch (err) {
    await pool.query('ROLLBACK').catch(() => {});
    next(err);
  }
};

// Get all page visibility settings
export const getPages = async (req, res, next) => {
  try {
    const result = await pool.query('SELECT page_name, is_visible FROM page_settings');
    const pages = {};
    result.rows.forEach((row) => {
      pages[row.page_name] = row.is_visible;
    });
    res.json(pages);
  } catch (err) {
    next(err);
  }
};

// Toggle page visibility
export const togglePage = async (req, res, next) => {
  const { pageName } = req.params;

  const validPages = ['factions', 'companies', 'leadership', 'respect'];
  if (!validPages.includes(pageName)) {
    return res.status(400).json({ error: 'Invalid page name' });
  }

  try {
    const result = await pool.query(
      `UPDATE page_settings
       SET is_visible = NOT is_visible, updated_by = $1, updated_at = CURRENT_TIMESTAMP
       WHERE page_name = $2
       RETURNING page_name, is_visible`,
      [req.user.userId, pageName]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Page not found' });
    }

    res.json({
      page: result.rows[0].page_name,
      isVisible: result.rows[0].is_visible,
    });
  } catch (err) {
    next(err);
  }
};

// Get cache status
export const getCacheStatus = async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT key, value, updated_at FROM system_settings'
    );
    const settings = {};
    result.rows.forEach((row) => {
      settings[row.key] = {
        value: row.value,
        updatedAt: row.updated_at,
      };
    });
    res.json(settings);
  } catch (err) {
    next(err);
  }
};

// Trigger cache refresh (placeholder)
export const refreshCache = async (req, res, next) => {
  try {
    await pool.query(
      `UPDATE system_settings
       SET updated_at = CURRENT_TIMESTAMP
       WHERE key = 'last_cache_refresh'`
    );

    res.json({ message: 'Cache refresh triggered' });
  } catch (err) {
    next(err);
  }
};

// Get analytics
export const getAnalytics = async (req, res, next) => {
  try {
    const totalUsersResult = await pool.query('SELECT COUNT(*) FROM users');
    const totalAdminsResult = await pool.query(
      'SELECT COUNT(*) FROM users WHERE is_admin = true'
    );
    const totalLoginsResult = await pool.query('SELECT COUNT(*) FROM login_history');
    const lastWeekLoginsResult = await pool.query(
      `SELECT COUNT(*) FROM login_history
       WHERE login_at > NOW() - INTERVAL '7 days'`
    );

    res.json({
      totalUsers: parseInt(totalUsersResult.rows[0].count),
      totalAdmins: parseInt(totalAdminsResult.rows[0].count),
      totalLogins: parseInt(totalLoginsResult.rows[0].count),
      loginsLastWeek: parseInt(lastWeekLoginsResult.rows[0].count),
    });
  } catch (err) {
    next(err);
  }
};

// Get system settings
export const getSettings = async (req, res, next) => {
  try {
    const result = await pool.query('SELECT key, value FROM system_settings');
    const settings = {};
    result.rows.forEach((row) => {
      settings[row.key] = row.value;
    });
    res.json(settings);
  } catch (err) {
    next(err);
  }
};

// Update system setting
export const updateSetting = async (req, res, next) => {
  const { key } = req.params;
  const { value } = req.body;

  if (!key || value === undefined) {
    return res.status(400).json({ error: 'Key and value are required' });
  }

  try {
    const result = await pool.query(
      `UPDATE system_settings
       SET value = $1, updated_at = CURRENT_TIMESTAMP
       WHERE key = $2
       RETURNING key, value`,
      [value, key]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
};
