import express, { Router } from 'express';
import { deleteUpload, listUploads, uploadPhoto } from '../controllers/photoController.js';
import { offerInputSchema, offerListSchema, supplierOffers } from '../controllers/offerController.js';
import { getPolicies, getRateCard, listTemplates, previewRateCard, updatePolicies, updateRateCard } from '../controllers/pricingController.js';
import {
  catalogue,
  createService,
  deleteService,
  getOwnHotel,
  getService,
  hotelInputSchema,
  listDepartures,
  listQuerySchema,
  listServices,
  overview,
  resumeDepartureSales,
  serviceInputSchema,
  stopDepartureSales,
  updateOwnHotel,
  updateService,
} from '../controllers/supplierController.js';
import {
  cancelDeparture,
  cancelReservation,
  cancelSchema,
  getDeparture,
  listReservations,
  listSpecialRequests,
  replySchema,
  replySpecialRequest,
  requestsQuerySchema,
  reservationsQuerySchema,
  rescheduleDepartureHandler,
  rescheduleSchema,
} from '../controllers/supplierOpsController.js';
import { querySchema, queryLine, supplierStatement, supplierStatements } from '../controllers/statementController.js';
import { messageSchema, supplierGet, supplierList, supplierReply } from '../controllers/ticketController.js';
import { MAX_PHOTO_BYTES, PHOTO_TYPES } from '../models/Photo.js';
import { requireAuth } from '../middleware/auth.js';
import { airlineOnly, hotelOnly, managerOnly } from '../middleware/roles.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(requireAuth, managerOnly);

router.get('/overview', overview);
router.get('/catalogue', catalogue);

// Airline: services and departures
router.get('/services', airlineOnly, validate(listQuerySchema, 'query'), listServices);
router.post('/services', airlineOnly, validate(serviceInputSchema), createService);
router.get('/services/:id', airlineOnly, getService);
router.put('/services/:id', airlineOnly, validate(serviceInputSchema), updateService);
router.delete('/services/:id', airlineOnly, deleteService);

router.get('/departures', airlineOnly, validate(listQuerySchema, 'query'), listDepartures);
router.get('/departures/:id', airlineOnly, getDeparture);
router.post('/departures/:id/stop-sales', airlineOnly, stopDepartureSales);
router.post('/departures/:id/resume-sales', airlineOnly, resumeDepartureSales);
router.post('/departures/:id/cancel', airlineOnly, validate(cancelSchema), cancelDeparture);
router.post('/departures/:id/reschedule', airlineOnly, validate(rescheduleSchema), rescheduleDepartureHandler);

// Hotel: property, rooms, photos and reservations
router.get('/hotel', hotelOnly, getOwnHotel);
router.put('/hotel', hotelOnly, validate(hotelInputSchema), updateOwnHotel);
router.get('/hotel/photos', hotelOnly, listUploads);
// Raw image body (no multipart parsing); the size limit is enforced while the body is read.
router.post('/hotel/photos', hotelOnly, express.raw({ type: PHOTO_TYPES, limit: MAX_PHOTO_BYTES }), uploadPhoto);
router.delete('/hotel/photos/:id', hotelOnly, deleteUpload);
router.get('/reservations', hotelOnly, validate(reservationsQuerySchema, 'query'), listReservations);
router.post('/reservations/:id/cancel', hotelOnly, validate(cancelSchema), cancelReservation);

// Pricing and policies
router.get('/rate-card', getRateCard);
router.put('/rate-card', updateRateCard);
router.post('/rate-card/preview', previewRateCard);
router.get('/policies', getPolicies);
router.put('/policies', updatePolicies);
router.get('/templates', listTemplates);

// Special requests and escalated tickets
router.get('/special-requests', validate(requestsQuerySchema, 'query'), listSpecialRequests);
router.post('/special-requests/:bookingId/reply', validate(replySchema), replySpecialRequest);
router.get('/tickets', supplierList);
router.get('/tickets/:id', supplierGet);
router.post('/tickets/:id/messages', validate(messageSchema), supplierReply);

// Settlement statements
router.get('/statements', supplierStatements);
router.get('/statements/:id', supplierStatement);
router.post('/statements/:id/lines/:ref/query', validate(querySchema), queryLine);

// Own offers
router.get('/offers', validate(offerListSchema, 'query'), supplierOffers.list);
router.post('/offers', validate(offerInputSchema), supplierOffers.create);
router.get('/offers/:id', supplierOffers.get);
router.put('/offers/:id', validate(offerInputSchema), supplierOffers.update);
router.post('/offers/:id/pause', supplierOffers.pause);
router.post('/offers/:id/resume', supplierOffers.resume);

export default router;
