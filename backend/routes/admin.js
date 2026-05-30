import express from 'express';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import {
  getAllUsers,
  getUserHistory,
  grantAdmin,
  revokeAdmin,
  getPages,
  togglePage,
  getCacheStatus,
  refreshCache,
  getAnalytics,
  getSettings,
  updateSetting,
} from '../controllers/adminController.js';

const router = express.Router();

// All admin routes require authentication and admin role
router.use(verifyToken, requireAdmin);

// User management
router.get('/users', getAllUsers);
router.get('/users/:tornUserId/history', getUserHistory);
router.post('/users/:tornUserId/grant', grantAdmin);
router.post('/users/:tornUserId/revoke', revokeAdmin);

// Page settings
router.get('/pages', getPages);
router.post('/pages/:pageName/toggle', togglePage);

// Cache management
router.get('/cache/status', getCacheStatus);
router.post('/cache/refresh', refreshCache);

// Analytics
router.get('/analytics', getAnalytics);

// System settings
router.get('/settings', getSettings);
router.post('/settings/:key', updateSetting);

export default router;
