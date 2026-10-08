import { Router } from 'express';
import { adminBookingsSchema, auditQuerySchema, getBooking, listAudit, listBookings, listSpecialRequests, listSuppliers } from '../controllers/adminController.js';
import { adminOffers, offerInputSchema, offerListSchema } from '../controllers/offerController.js';
import { getCommission, listTemplates, updateCommission, updateTemplate } from '../controllers/pricingController.js';
import { adminClose, adminEscalate, adminGet, adminList, adminListSchema, adminReply, escalateSchema, messageSchema } from '../controllers/ticketController.js';
import { adminOnly, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(requireAuth, adminOnly);

router.get('/audit', validate(auditQuerySchema, 'query'), listAudit);
router.get('/suppliers', listSuppliers);

router.get('/bookings', validate(adminBookingsSchema, 'query'), listBookings);
router.get('/bookings/:ref', getBooking);
router.get('/special-requests', listSpecialRequests);

router.get('/tickets', validate(adminListSchema, 'query'), adminList);
router.get('/tickets/:id', adminGet);
router.post('/tickets/:id/reply', validate(messageSchema), adminReply);
router.post('/tickets/:id/close', adminClose);
router.post('/tickets/:id/escalate', validate(escalateSchema), adminEscalate);

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

export default router;
