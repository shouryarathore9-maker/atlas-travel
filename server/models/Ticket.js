import mongoose from 'mongoose';
import { sandboxScope } from './plugins/sandboxScope.js';

export const TICKET_MESSAGE_LIMIT = 50;
export const CLOSED_TICKET_TTL_DAYS = 365;

// Help tickets (prd.md → Workflow 5) and, from the settlement stage, supplier statement queries.
// Closed tickets are deleted a year after they close.
const ticketSchema = new mongoose.Schema({
  type: { type: String, enum: ['booking_problem', 'statement_query'], required: true },
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
  bookingReference: { type: String, default: null },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null, index: true },
  travellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  statementId: { type: mongoose.Schema.Types.ObjectId, default: null },
  subject: { type: String, maxlength: 120 },
  status: { type: String, enum: ['open', 'escalated', 'answered', 'closed', 'resolved'], default: 'open' },
  resolution: { type: new mongoose.Schema({ kind: String, amount: Number, note: String }, { _id: false }), default: null },
  messages: [
    {
      _id: false,
      authorRole: { type: String, enum: ['traveller', 'admin', 'supplier'] },
      authorName: String,
      body: { type: String, maxlength: 1000 },
      at: { type: Date, default: Date.now },
    },
  ],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  closedAt: { type: Date, default: null },
});

ticketSchema.plugin(sandboxScope);
ticketSchema.index({ status: 1, updatedAt: -1 });
ticketSchema.index({ closedAt: 1 }, { expireAfterSeconds: CLOSED_TICKET_TTL_DAYS * 24 * 3600, partialFilterExpression: { closedAt: { $type: 'date' } } });

export default mongoose.model('Ticket', ticketSchema);
