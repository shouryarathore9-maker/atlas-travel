import mongoose from 'mongoose';

// Funnel events for the analytics dashboard (prd.md → Workflow 12). Written by the server at fixed
// points (a search, a details view, a checkout quote, a payment attempt, a confirmed booking) —
// never per keystroke and never from a sandbox. Kept 14 days; the daily job rolls each day up into
// a permanent DailyStat first. No user ids or search terms are stored.
export const EVENT_TYPES = ['search', 'view', 'checkout_start', 'pay_attempt', 'confirmed'];
export const EVENT_TTL_DAYS = 14;

const eventSchema = new mongoose.Schema({
  type: { type: String, enum: EVENT_TYPES, required: true },
  product: { type: String, enum: ['flight', 'hotel'], required: true },
  zeroResults: { type: Boolean, default: false },
  at: { type: Date, default: Date.now },
});

eventSchema.index({ at: 1 }, { expireAfterSeconds: EVENT_TTL_DAYS * 24 * 3600 });

export default mongoose.model('Event', eventSchema);
