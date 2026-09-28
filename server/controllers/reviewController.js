import mongoose from 'mongoose';
import { z } from 'zod';
import Review from '../models/Review.js';

export const reviewQuerySchema = z.object({
  itemType: z.enum(['flight', 'hotel']),
  itemId: z.string().refine((id) => mongoose.isValidObjectId(id), 'Invalid item id'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

export async function listReviews(req, res) {
  const { itemType, itemId, page, limit } = req.validated.query;
  const filter = { itemType, itemId };
  const [reviews, total] = await Promise.all([
    Review.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Review.countDocuments(filter),
  ]);
  res.json({ reviews, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
}
