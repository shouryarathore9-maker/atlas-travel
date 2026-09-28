import { Router } from 'express';
import { listReviews, reviewQuerySchema } from '../controllers/reviewController.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.get('/', validate(reviewQuerySchema, 'query'), listReviews);

export default router;
