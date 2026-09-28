import { Router } from 'express';
import { login, loginSchema, logout, me, register, registerSchema } from '../controllers/authController.js';
import { optionalAuth } from '../middleware/auth.js';
import { authLimiter, sessionLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.post('/register', authLimiter, validate(registerSchema), register);
router.post('/login', authLimiter, validate(loginSchema), login);
router.post('/logout', sessionLimiter, logout);
router.get('/me', sessionLimiter, optionalAuth, me);

export default router;
