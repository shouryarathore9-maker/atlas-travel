import mongoose from 'mongoose';

// One permanent summary per IST day and product, rolled up from funnel events by the daily job
// (prd.md → Retention). Platform-wide aggregate counts only.
const dailyStatSchema = new mongoose.Schema({
  date: { type: String, required: true }, // YYYY-MM-DD (IST)
  product: { type: String, enum: ['flight', 'hotel'], required: true },
  searches: { type: Number, default: 0 },
  zeroResults: { type: Number, default: 0 },
  views: { type: Number, default: 0 },
  checkoutStarts: { type: Number, default: 0 },
  payAttempts: { type: Number, default: 0 },
  confirmed: { type: Number, default: 0 },
  isSynthetic: { type: Boolean, default: false },
});

dailyStatSchema.index({ date: 1, product: 1 }, { unique: true });

export default mongoose.model('DailyStat', dailyStatSchema);
