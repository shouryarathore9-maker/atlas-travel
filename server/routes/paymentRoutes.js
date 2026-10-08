import { Router } from 'express';
import { mockPayment, mockPaymentSchema, quote, quoteSchema } from '../controllers/paymentController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.post('/quote', requireAuth, validate(quoteSchema), quote);
router.post('/mock', requireAuth, validate(mockPaymentSchema), mockPayment);

export default router;
