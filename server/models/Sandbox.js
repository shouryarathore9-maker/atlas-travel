import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

export const SANDBOX_IDLE_MS = 30 * 60 * 1000;
export const SANDBOX_MAX_MS = 2 * 3600 * 1000;
export const SANDBOX_DAYS = 7; // an airline sandbox holds the next 7 days of departures
export const SANDBOX_LIMITS = { active: 20, docs: 2000, listings: 20, bookings: 50, perIpPerHour: 3 };

// One visitor demo (prd.md → Visitor Sandbox Rules). Not itself sandbox-scoped: it's the registry the
// session middleware and the sweep read. Both TTL indexes are backstops — the daily sweep and the
// session check end sandboxes (and delete their documents) first.
const sandboxSchema = new mongoose.Schema({
  kind: { type: String, enum: ['airline', 'hotel', 'admin'], required: true },
  sourceSupplierIds: [ObjectId], // the real supplier(s) copied
  supplierId: { type: ObjectId, default: null }, // the copied supplier (supplier sandboxes)
  managerId: ObjectId, // the sandbox manager or admin account
  travellerId: { type: ObjectId, default: null }, // the demo traveller (supplier sandboxes)
  ipHash: String,
  counts: { docs: { type: Number, default: 0 }, listings: { type: Number, default: 0 }, bookings: { type: Number, default: 0 } },
  createdAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
});

sandboxSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sandboxSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: SANDBOX_IDLE_MS / 1000 });
sandboxSchema.index({ ipHash: 1, createdAt: -1 });

export default mongoose.model('Sandbox', sandboxSchema);
