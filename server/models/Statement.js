import mongoose from 'mongoose';
import { sandboxScope } from './plugins/sandboxScope.js';

const { ObjectId } = mongoose.Schema.Types;

// A supplier's frozen monthly settlement statement (prd.md → Settlement). Lines never change after
// creation; only `status`, `paidAt`, `paymentRef` and `paidBy` are set later (mark as paid).
const lineSchema = new mongoose.Schema(
  {
    bookingId: { type: ObjectId, default: null },
    adjustmentId: { type: ObjectId, default: null },
    bookingReference: { type: String, default: null },
    kind: { type: String, enum: ['completed', 'cancellation_fee', 'supplier_cancelled', 'adjustment'], required: true },
    date: Date, // completed: arrival / check-out; cancellations: when cancelled; adjustments: when resolved
    description: String,
    funder: { type: String, default: null }, // the offer's funder, if any
    gross: Number, // before discount (taxes included; they pass through to the supplier)
    discountPlatform: Number,
    discountSupplier: Number,
    refunds: Number,
    commission: Number,
    net: Number, // owed to the supplier
    atlasTake: Number, // what Atlas keeps (commission minus a platform-funded discount; may be negative)
    note: { type: String, default: '' },
  },
  { _id: false },
);

const totals = {
  lines: Number,
  gross: Number,
  discountPlatform: Number,
  discountSupplier: Number,
  refunds: Number,
  commission: Number,
  net: Number,
  atlasTake: Number,
};

const statementSchema = new mongoose.Schema({
  supplierId: { type: ObjectId, ref: 'Supplier', required: true },
  period: { type: String, required: true }, // 'YYYY-MM' (IST)
  commissionRate: { type: Number, required: true },
  lines: [lineSchema],
  totals,
  status: { type: String, enum: ['ready', 'paid'], default: 'ready' },
  paidAt: { type: Date, default: null },
  paymentRef: { type: String, default: null },
  paidBy: { type: String, default: null },
  isSynthetic: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

statementSchema.plugin(sandboxScope);
statementSchema.index({ sandboxId: 1, supplierId: 1, period: 1 }, { unique: true });
statementSchema.index({ period: -1, status: 1 });

export const MAX_STATEMENT_LINES = 5000;

export default mongoose.model('Statement', statementSchema);
