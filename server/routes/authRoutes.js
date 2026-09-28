import { Router } from 'express';
import { login, loginSchema, logout, me, register, registerSchema } from '../controllers/authController.js';
import { optionalAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(authLimiter);
router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.post('/logout', logout);
router.get('/me', optionalAuth, me);

export default router;
