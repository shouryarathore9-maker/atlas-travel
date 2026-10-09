import mongoose from 'mongoose';
import { sandboxScope } from './plugins/sandboxScope.js';

// One supplier organisation per airline and per hotel (prd.md → Stakeholders), each run by one manager.
// rateCard and policies are filled in by the pricing stage; they're free-form here on purpose.
const supplierSchema = new mongoose.Schema({
  kind: { type: String, enum: ['airline', 'hotel'], required: true },
  name: { type: String, required: true, trim: true },
  code: { type: String, default: null }, // airline IATA code (6E, AI, UK, SG)
  hotelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hotel', default: null },
  slug: { type: String, required: true },
  rateCard: { type: mongoose.Schema.Types.Mixed, default: {} },
  policies: { type: mongoose.Schema.Types.Mixed, default: {} },
  // Admin can suspend a supplier: its listings leave search, bookings stop and its manager can't sign in.
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  suspension: {
    reason: { type: String, default: '' },
    at: { type: Date, default: null },
    by: { type: String, default: '' },
  },
  // Admin's per-supplier commission, scheduled by month (services/commission.js). Empty = product default;
  // an entry with rate null switches back to the default from its month.
  commissionOverrides: {
    type: [{ _id: false, from: { type: String, required: true }, rate: { type: Number, default: null } }],
    default: [],
  },
});

supplierSchema.plugin(sandboxScope);
supplierSchema.index({ sandboxId: 1, slug: 1 }, { unique: true });
supplierSchema.index({ kind: 1, name: 1 });
supplierSchema.index({ status: 1 });

export default mongoose.model('Supplier', supplierSchema);
