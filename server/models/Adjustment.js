import mongoose from 'mongoose';
import { sandboxScope } from './plugins/sandboxScope.js';

const { ObjectId } = mongoose.Schema.Types;

// A correction from a resolved statement query (prd.md → Settlement → Queries). It appears as a line on
// the supplier's next statement; `statementId` is set once it has been carried there. Permanent.
const adjustmentSchema = new mongoose.Schema({
  supplierId: { type: ObjectId, ref: 'Supplier', required: true },
  amount: { type: Number, required: true }, // ± rupees, positive = Atlas owes the supplier more
  note: { type: String, required: true },
  ticketId: { type: ObjectId, default: null },
  bookingReference: { type: String, default: null },
  fromStatementId: { type: ObjectId, default: null }, // the statement whose line was queried
  statementId: { type: ObjectId, default: null }, // the statement it was applied on
  isSynthetic: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

adjustmentSchema.plugin(sandboxScope);
adjustmentSchema.index({ supplierId: 1, statementId: 1 });

export default mongoose.model('Adjustment', adjustmentSchema);
