import crypto from 'node:crypto';
import { Router } from 'express';
import { extendFlightWindow } from '../services/flightWindow.js';
import { HttpError } from '../utils/httpError.js';

const router = Router();

// Vercel Cron calls this with `Authorization: Bearer <CRON_SECRET>`. Anyone else gets 401.
function requireCronSecret(req, res, next) {
  const secret = process.env.CRON_SECRET;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(req.get('authorization') || '');
  const ok = Boolean(secret) && given.length === expected.length && crypto.timingSafeEqual(given, expected);
  if (!ok) throw new HttpError(401, 'Unauthorized', 'UNAUTHORIZED');
  next();
}

router.get('/extend-flights', requireCronSecret, async (req, res) => {
  const result = await extendFlightWindow();
  console.log('extend-flights', JSON.stringify(result));
  res.json(result);
});

export default router;
