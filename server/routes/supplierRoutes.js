import express, { Router } from 'express';
import { deleteUpload, listUploads, uploadPhoto } from '../controllers/photoController.js';
import { MAX_PHOTO_BYTES, PHOTO_TYPES } from '../models/Photo.js';
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
import { requireAuth } from '../middleware/auth.js';
import { airlineOnly, hotelOnly, managerOnly } from '../middleware/roles.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(requireAuth, managerOnly);

router.get('/overview', overview);
router.get('/catalogue', catalogue);

router.get('/services', airlineOnly, validate(listQuerySchema, 'query'), listServices);
router.post('/services', airlineOnly, validate(serviceInputSchema), createService);
router.get('/services/:id', airlineOnly, getService);
router.put('/services/:id', airlineOnly, validate(serviceInputSchema), updateService);
router.delete('/services/:id', airlineOnly, deleteService);

router.get('/departures', airlineOnly, validate(listQuerySchema, 'query'), listDepartures);
router.post('/departures/:id/stop-sales', airlineOnly, stopDepartureSales);
router.post('/departures/:id/resume-sales', airlineOnly, resumeDepartureSales);

router.get('/hotel', hotelOnly, getOwnHotel);
router.put('/hotel', hotelOnly, validate(hotelInputSchema), updateOwnHotel);
router.get('/hotel/photos', hotelOnly, listUploads);
// Raw image body (no multipart parsing); the size limit is enforced while the body is read.
router.post('/hotel/photos', hotelOnly, express.raw({ type: PHOTO_TYPES, limit: MAX_PHOTO_BYTES }), uploadPhoto);
router.delete('/hotel/photos/:id', hotelOnly, deleteUpload);

export default router;
