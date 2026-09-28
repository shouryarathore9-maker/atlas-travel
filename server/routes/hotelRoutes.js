import { Router } from 'express';
import { getHotel, hotelSearchSchema, listCities, searchHotels } from '../controllers/hotelController.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.get('/', validate(hotelSearchSchema, 'query'), searchHotels);
router.get('/cities', listCities);
router.get('/:id', getHotel);

export default router;
