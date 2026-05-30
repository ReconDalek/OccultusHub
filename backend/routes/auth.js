import express from 'express';
import { login, session, logout } from '../controllers/authController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

router.post('/login', login);
router.get('/session', verifyToken, session);
router.post('/logout', verifyToken, logout);

export default router;
