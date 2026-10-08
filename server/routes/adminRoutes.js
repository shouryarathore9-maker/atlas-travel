import { Router } from 'express';
import { auditQuerySchema, listAudit, listSuppliers } from '../controllers/adminController.js';
import { adminOnly, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(requireAuth, adminOnly);

router.get('/audit', validate(auditQuerySchema, 'query'), listAudit);
router.get('/suppliers', listSuppliers);

export default router;
