import { Router } from 'express';
import { getPublicOffer, listPublicOffers, publicListSchema } from '../controllers/offerController.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.get('/', validate(publicListSchema, 'query'), listPublicOffers);
router.get('/:slug', getPublicOffer);

export default router;
