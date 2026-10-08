import { Router } from 'express';
import { cancelBooking, getDocuments, getMyBooking, listMyBookings, respondToReschedule, rescheduleResponseSchema, webCheckIn } from '../controllers/bookingController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(requireAuth);
router.get('/me', listMyBookings);
router.get('/:key', getMyBooking);
router.get('/:key/documents', getDocuments);
router.post('/:key/check-in', webCheckIn);
router.post('/:key/reschedule-response', validate(rescheduleResponseSchema), respondToReschedule);
router.patch('/:id/cancel', cancelBooking);

export default router;
