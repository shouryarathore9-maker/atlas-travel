import mongoose from 'mongoose';

// Phase 2 (not used by the MVP). Defined so the schema in architecture.md exists in code.
const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true },
  discountType: { type: String, enum: ['flat', 'percent'], required: true },
  discountValue: { type: Number, required: true },
  minAmount: { type: Number, default: 0 },
  expiryDate: Date,
});

export default mongoose.model('Coupon', couponSchema);
