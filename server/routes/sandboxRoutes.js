// Visitor sandboxes (prd.md → Visitor sandbox; architecture.md §14). Starting one is public and
// rate-limited; everything else runs behind `sandboxSession`, which scopes every query to the visitor's
// own copy. The same routers as the real site are mounted below, so the consoles work unchanged.
import { Router } from 'express';
import { z } from 'zod';
import adminRoutes from './adminRoutes.js';
import bookingRoutes from './bookingRoutes.js';
import flightRoutes from './flightRoutes.js';
import hotelRoutes from './hotelRoutes.js';
import meRoutes from './meRoutes.js';
import notificationRoutes from './notificationRoutes.js';
import offerRoutes from './offerRoutes.js';
import paymentRoutes from './paymentRoutes.js';
import reviewRoutes from './reviewRoutes.js';
import supplierRoutes from './supplierRoutes.js';
import { sandboxLimiter } from '../middleware/rateLimit.js';
import { clearSandboxCookie, readSandboxToken, sandboxSession, setSandboxCookie } from '../middleware/sandboxSession.js';
import { validate } from '../middleware/validate.js';
import Sandbox from '../models/Sandbox.js';
import { createSandbox, endSandbox, sandboxOptions } from '../services/sandbox.js';
import { HttpError } from '../utils/httpError.js';

const router = Router();

router.get('/options', async (req, res) => res.json(await sandboxOptions()));

// Whether this browser has a live sandbox (never an error, so the SPA can ask on every load).
router.get('/session', async (req, res) => {
  const payload = readSandboxToken(req);
  const sandbox = payload && (await Sandbox.findById(payload.sid).lean());
  const live = sandbox && sandbox.expiresAt > new Date() && sandbox.lastSeenAt > new Date(Date.now() - 30 * 60 * 1000);
  if (!live) {
    if (payload) clearSandboxCookie(res);
    return res.json({ active: false });
  }
  res.json({ active: true, kind: sandbox.kind, role: String(payload.uid) === String(sandbox.travellerId) ? 'traveller' : 'staff', expiresAt: sandbox.expiresAt });
});

const startSchema = z
  .object({ kind: z.enum(['airline', 'hotel', 'admin']), supplierId: z.string().regex(/^[a-f\d]{24}$/i, 'Choose an airline or hotel').optional() })
  .refine((b) => b.kind === 'admin' || b.supplierId, { message: 'Choose an airline or hotel', path: ['supplierId'] });

router.post('/', sandboxLimiter, validate(startSchema), async (req, res) => {
  const previous = readSandboxToken(req);
  if (previous) await endSandbox(previous.sid); // one sandbox per browser
  const { sandbox, userId } = await createSandbox({ ...req.validated.body, ip: req.ip });
  setSandboxCookie(res, sandbox._id, userId);
  res.status(201).json({ active: true, kind: sandbox.kind, role: 'staff', expiresAt: sandbox.expiresAt });
});

router.use(sandboxSession);

router.delete('/', async (req, res) => {
  await endSandbox(req.sandbox._id);
  clearSandboxCookie(res);
  res.json({ active: false });
});

// Supplier sandboxes: switch between the console and the demo traveller.
router.post('/switch', (req, res) => {
  const { sandbox } = req;
  if (!sandbox.travellerId) throw new HttpError(400, 'This demo has no traveller view.', 'NOT_ALLOWED');
  const toTraveller = String(req.sandboxUser._id) !== String(sandbox.travellerId);
  setSandboxCookie(res, sandbox._id, toTraveller ? sandbox.travellerId : sandbox.managerId);
  res.json({ active: true, kind: sandbox.kind, role: toTraveller ? 'traveller' : 'staff', expiresAt: sandbox.expiresAt });
});

// The signed-in account, as /api/auth/me answers for real sessions.
router.get('/auth/me', (req, res) => res.json({ user: req.sandboxUser.toPublic() }));
router.use('/flights', flightRoutes);
router.use('/hotels', hotelRoutes);
router.use('/reviews', reviewRoutes);
router.use('/bookings', bookingRoutes);
router.use('/payments', paymentRoutes);
router.use('/notifications', notificationRoutes);
router.use('/me', meRoutes);
router.use('/offers', offerRoutes);
router.use('/supplier', supplierRoutes);
router.use('/admin', adminRoutes);

export default router;
