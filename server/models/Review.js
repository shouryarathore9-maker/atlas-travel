import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    itemType: { type: String, enum: ['flight', 'hotel'], required: true },
    itemId: { type: mongoose.Schema.Types.ObjectId, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    authorName: { type: String, default: 'Atlas traveller' }, // seed reviews have no real user
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

reviewSchema.index({ itemType: 1, itemId: 1, createdAt: -1 });

export default mongoose.model('Review', reviewSchema);
