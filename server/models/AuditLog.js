import mongoose from 'mongoose';
import { sandboxScope } from './plugins/sandboxScope.js';

// Permanent, append-only record of staff actions (prd.md → Workflow 14): one entry per action,
// never one per affected booking. There is deliberately no update or delete path in the app.
const auditLogSchema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  actorName: String,
  actorRole: { type: String, required: true },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
  action: { type: String, required: true }, // e.g. "service.update", "departure.stop_sales"
  target: { type: { type: String }, id: mongoose.Schema.Types.ObjectId, label: String },
  before: { type: mongoose.Schema.Types.Mixed, default: null },
  after: { type: mongoose.Schema.Types.Mixed, default: null },
  count: { type: Number, default: null }, // how many bookings one action affected, where relevant
  at: { type: Date, default: Date.now },
});

auditLogSchema.plugin(sandboxScope);
auditLogSchema.index({ at: -1 });
auditLogSchema.index({ supplierId: 1, at: -1 });

export default mongoose.model('AuditLog', auditLogSchema);
