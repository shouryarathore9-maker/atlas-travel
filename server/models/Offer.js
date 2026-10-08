import mongoose from 'mongoose';
import { sandboxScope } from './plugins/sandboxScope.js';

// An offer (prd.md → Offers). Platform offers are created by admin and funded by Atlas; supplier
// offers are created by a manager, funded by that supplier, and apply only to its own items.
// validFrom / validTo are booking dates (YYYY-MM-DD, IST).
const offerSchema = new mongoose.Schema({
  slug: { type: String, required: true },
  code: { type: String, default: null, uppercase: true, trim: true }, // null for automatic offers
  auto: { type: Boolean, default: false },
  title: { type: String, required: true, maxlength: 80 },
  summary: { type: String, required: true, maxlength: 140 },
  description: { type: String, default: '', maxlength: 600 },
  image: { type: String, default: '' },
  funder: { type: String, enum: ['platform', 'supplier'], required: true },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null, index: true },
  supplierName: { type: String, default: null },
  scope: { type: String, enum: ['flights', 'hotels', 'both'], required: true },
  discountType: { type: String, enum: ['percent', 'flat'], required: true },
  value: { type: Number, required: true, min: 1 },
  maxDiscount: { type: Number, default: null }, // percent offers: the cap
  minSpend: { type: Number, default: 0 },
  validFrom: { type: String, required: true },
  validTo: { type: String, required: true },
  redemptionLimit: { type: Number, default: null },
  redemptions: { type: Number, default: 0, min: 0 },
  firstBookingsOnly: { type: Boolean, default: false },
  paymentMethod: { type: String, default: null }, // reserved for a later bank/UPI condition (out of scope now)
  status: { type: String, enum: ['active', 'paused', 'expired', 'exhausted'], default: 'active' },
  endNotified: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
});

offerSchema.plugin(sandboxScope);
offerSchema.index({ sandboxId: 1, slug: 1 }, { unique: true });
offerSchema.index({ sandboxId: 1, code: 1 }, { unique: true, partialFilterExpression: { code: { $type: 'string' } } });
offerSchema.index({ status: 1, validTo: 1 });

export default mongoose.model('Offer', offerSchema);
