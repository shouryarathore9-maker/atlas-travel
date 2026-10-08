import mongoose from 'mongoose';
import { z } from 'zod';
import Flight from '../models/Flight.js';
import Review from '../models/Review.js';
import { reviewTarget } from './flightController.js';

export const reviewQuerySchema = z.object({
  itemType: z.enum(['flight', 'hotel']),
  itemId: z.string().refine((id) => mongoose.isValidObjectId(id), 'Invalid item id'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

export async function listReviews(req, res) {
  const { itemType, itemId, page, limit } = req.validated.query;
  let filter = { itemType, itemId };
  // The client asks for a departure's reviews; they're stored against its service.
  if (itemType === 'flight') {
    const flight = await Flight.findById(itemId, { serviceId: 1 }).lean();
    if (flight) filter = reviewTarget(flight);
  }
  const [reviews, total] = await Promise.all([
    Review.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Review.countDocuments(filter),
  ]);
  res.json({ reviews, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
}
