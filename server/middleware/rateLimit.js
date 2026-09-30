import rateLimit from 'express-rate-limit';
import { MongoRateLimitStore } from './mongoRateLimitStore.js';

const isTest = process.env.NODE_ENV === 'test';

// Counters live in MongoDB so the limit is the same no matter which server instance
// (locally, or any Vercel function instance) handles a request.
const limiter = (name, limit) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: isTest ? 1000 : limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: new MongoRateLimitStore({ prefix: `${name}:` }),
    handler: (req, res) =>
      res.status(429).json({
        error: { message: 'Too many attempts. Please wait a few minutes and try again.', code: 'RATE_LIMITED' },
      }),
  });

// Strict: endpoints that accept credentials (brute-force protection).
export const authLimiter = limiter('auth', 30);

// Lenient: the session check runs on every page load, so it gets its own, larger budget.
export const sessionLimiter = limiter('session', 600);
