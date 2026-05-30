import express from 'express';
import pool from '../db/pool.js';

const router = express.Router();

// Public endpoint to get page visibility settings
router.get('/pages/visibility', async (req, res, next) => {
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
});

export default router;
