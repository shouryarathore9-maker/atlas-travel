import rateLimit from 'express-rate-limit';

const isTest = process.env.NODE_ENV === 'test';

const limiter = (limit) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: isTest ? 1000 : limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) =>
      res.status(429).json({
        error: { message: 'Too many attempts. Please wait a few minutes and try again.', code: 'RATE_LIMITED' },
      }),
  });

// Strict: endpoints that accept credentials (brute-force protection).
export const authLimiter = limiter(30);

// Lenient: the session check runs on every page load, so it gets its own, larger budget.
export const sessionLimiter = limiter(600);
