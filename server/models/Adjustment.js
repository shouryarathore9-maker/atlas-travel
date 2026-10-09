import mongoose from 'mongoose';
import { sandboxScope } from './plugins/sandboxScope.js';

const { ObjectId } = mongoose.Schema.Types;

// A correction to what a supplier is owed (prd.md → Settlement → Adjustments): from a resolved statement
// query, or added by admin directly. Also the balance a month that ended below zero carries forward
// (kind 'balance'). It appears as a line on the supplier's next statement; `statementId` is set once it
// has landed there. Permanent: no edit or delete path.
const adjustmentSchema = new mongoose.Schema({
  supplierId: { type: ObjectId, ref: 'Supplier', required: true },
  kind: { type: String, enum: ['adjustment', 'balance'], default: 'adjustment' },
  amount: { type: Number, required: true }, // ± rupees, positive = Atlas owes the supplier more
  note: { type: String, required: true },
  ticketId: { type: ObjectId, default: null },
  bookingReference: { type: String, default: null },
  createdBy: { type: String, default: null }, // admin's name (null for balances)
  fromStatementId: { type: ObjectId, default: null }, // the queried statement, or the one a balance came from
  statementId: { type: ObjectId, default: null }, // the statement it was applied on
  isSynthetic: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

adjustmentSchema.plugin(sandboxScope);
adjustmentSchema.index({ supplierId: 1, statementId: 1 });
// A statement carries its balance forward once.
adjustmentSchema.index({ sandboxId: 1, fromStatementId: 1 }, { unique: true, partialFilterExpression: { kind: 'balance' } });

export default mongoose.model('Adjustment', adjustmentSchema);
