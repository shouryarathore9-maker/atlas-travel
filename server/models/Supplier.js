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
});

supplierSchema.plugin(sandboxScope);
supplierSchema.index({ sandboxId: 1, slug: 1 }, { unique: true });
supplierSchema.index({ kind: 1, name: 1 });

export default mongoose.model('Supplier', supplierSchema);
