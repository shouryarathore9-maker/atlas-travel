import mongoose from 'mongoose';

// One document per rate-limit key (e.g. "auth:203.0.113.7"). Shared by every server
// instance, so limits hold on Vercel where requests are spread across function instances.
const rateLimitSchema = new mongoose.Schema(
  {
    _id: { type: String },
    hits: { type: Number, required: true },
    resetAt: { type: Date, required: true },
  },
  { versionKey: false },
);

// MongoDB deletes each counter automatically once its window has ended.
rateLimitSchema.index({ resetAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('RateLimit', rateLimitSchema, 'ratelimits');
