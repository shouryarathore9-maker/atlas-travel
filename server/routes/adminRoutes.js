import { Router } from 'express';
import {
  adminBookingsSchema,
  analyticsSchema,
  getAnalytics,
  auditQuerySchema,
  getBooking,
  listAudit,
  listBookings,
  listSpecialRequests,
  listSuppliers,
  reactivateSupplier,
  suspendSchema,
  suspendSupplier,
} from '../controllers/adminController.js';
import { adminOffers, offerInputSchema, offerListSchema } from '../controllers/offerController.js';
import { adminStatement, adminStatements, adminStatementsSchema, markPaid, markPaidSchema, resolveQuery, resolveSchema } from '../controllers/statementController.js';
import { getCommission, getLimits, listTemplates, updateCommission, updateLimits, updateTemplate } from '../controllers/pricingController.js';
import { adminClose, adminEscalate, adminGet, adminList, adminListSchema, adminReply, escalateSchema, messageSchema } from '../controllers/ticketController.js';
import { adminOnly, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(requireAuth, adminOnly);

router.get('/analytics', validate(analyticsSchema, 'query'), getAnalytics);
router.get('/audit', validate(auditQuerySchema, 'query'), listAudit);
router.get('/suppliers', listSuppliers);
router.post('/suppliers/:id/suspend', validate(suspendSchema), suspendSupplier);
router.post('/suppliers/:id/reactivate', reactivateSupplier);

router.get('/bookings', validate(adminBookingsSchema, 'query'), listBookings);
router.get('/bookings/:ref', getBooking);
router.get('/special-requests', listSpecialRequests);

router.get('/tickets', validate(adminListSchema, 'query'), adminList);
router.get('/tickets/:id', adminGet);
router.post('/tickets/:id/reply', validate(messageSchema), adminReply);
router.post('/tickets/:id/close', adminClose);
router.post('/tickets/:id/escalate', validate(escalateSchema), adminEscalate);
router.post('/tickets/:id/resolve', validate(resolveSchema), resolveQuery);

router.get('/statements', validate(adminStatementsSchema, 'query'), adminStatements);
router.get('/statements/:id', adminStatement);
router.post('/statements/:id/mark-paid', validate(markPaidSchema), markPaid);

router.get('/offers', validate(offerListSchema, 'query'), adminOffers.list);
router.post('/offers', validate(offerInputSchema), adminOffers.create);
router.get('/offers/:id', adminOffers.get);
router.put('/offers/:id', validate(offerInputSchema), adminOffers.update);
router.post('/offers/:id/pause', adminOffers.pause);
router.post('/offers/:id/resume', adminOffers.resume);

router.get('/templates', listTemplates);
router.put('/templates/:key', updateTemplate);
router.get('/settings/commission', getCommission);
router.put('/settings/commission', updateCommission);
router.get('/settings/pricing-limits', getLimits);
router.put('/settings/pricing-limits', updateLimits);

export default router;
