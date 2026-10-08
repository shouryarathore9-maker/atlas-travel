import { Router } from 'express';
import { flightDetailSchema, flightSearchSchema, getFlight, searchFlights } from '../controllers/flightController.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.get('/', validate(flightSearchSchema, 'query'), searchFlights);
router.get('/:id', validate(flightDetailSchema, 'query'), getFlight);

export default router;
