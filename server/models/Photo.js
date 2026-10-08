import mongoose from 'mongoose';

// Photos a hotel manager uploaded from their own computer (prd.md → Supplier console → Photos).
// Stored in MongoDB because the free tier has no other storage: each is a small, re-encoded
// image (≤ 350 KB) and a hotel can keep at most 4. Unused uploads are deleted by the daily job.
// Sandboxes can't upload (they pick from the preset gallery), so there's no sandbox scope here.
export const MAX_PHOTO_BYTES = 350 * 1024;
export const MAX_UPLOADS_PER_HOTEL = 4;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const photoSchema = new mongoose.Schema({
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
  hotelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hotel', required: true },
  contentType: { type: String, enum: PHOTO_TYPES, required: true },
  size: { type: Number, required: true },
  data: { type: Buffer, required: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
});

export const photoUrl = (id) => `/api/photos/${id}`;

export default mongoose.model('Photo', photoSchema);
