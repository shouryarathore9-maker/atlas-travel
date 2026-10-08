import { Router } from 'express';
import {
  featuredQuerySchema,
  getHotel,
  hotelDetailSchema,
  hotelSearchSchema,
  listCities,
  listFeatured,
  searchHotels,
} from '../controllers/hotelController.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.get('/', validate(hotelSearchSchema, 'query'), searchHotels);
router.get('/cities', listCities);
router.get('/featured', validate(featuredQuerySchema, 'query'), listFeatured);
router.get('/:id', validate(hotelDetailSchema, 'query'), getHotel);

export default router;
