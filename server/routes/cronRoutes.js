import crypto from 'node:crypto';
import { Router } from 'express';
import { runDailyJob } from '../services/dailyJob.js';
import { runWithContext } from '../utils/context.js';
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

// The daily maintenance job works across all data (including sweeping sandboxes), so it runs
// outside the per-request sandbox scope.
router.get('/daily', requireCronSecret, async (req, res) => {
  const result = await runWithContext(undefined, () => runDailyJob());
  console.log('daily-job', JSON.stringify(result));
  res.json(result);
});

export default router;
