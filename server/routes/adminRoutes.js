import { Router } from 'express';
import {
  adminListSchema,
  createFlight,
  createHotel,
  deleteFlight,
  deleteHotel,
  flightInputSchema,
  getFlightAdmin,
  getHotelAdmin,
  hotelInputSchema,
  listFlights,
  listHotels,
  updateFlight,
  updateHotel,
} from '../controllers/adminController.js';
import { adminOnly, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(requireAuth, adminOnly);

router.get('/flights', validate(adminListSchema, 'query'), listFlights);
router.get('/flights/:id', getFlightAdmin);
router.post('/flights', validate(flightInputSchema), createFlight);
router.put('/flights/:id', validate(flightInputSchema), updateFlight);
router.delete('/flights/:id', deleteFlight);

router.get('/hotels', validate(adminListSchema, 'query'), listHotels);
router.get('/hotels/:id', getHotelAdmin);
router.post('/hotels', validate(hotelInputSchema), createHotel);
router.put('/hotels/:id', validate(hotelInputSchema), updateHotel);
router.delete('/hotels/:id', deleteHotel);

export default router;
