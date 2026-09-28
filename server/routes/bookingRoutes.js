import { Router } from 'express';
import { cancelBooking, getMyBooking, listMyBookings } from '../controllers/bookingController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);
router.get('/me', listMyBookings);
router.get('/:key', getMyBooking);
router.patch('/:id/cancel', cancelBooking);

export default router;
