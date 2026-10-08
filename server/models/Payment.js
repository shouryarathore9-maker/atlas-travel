import mongoose from 'mongoose';
import { sandboxScope } from './plugins/sandboxScope.js';

// Mock payments only. No card or UPI details are ever stored.
const paymentSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  amount: { type: Number, required: true },
  method: { type: String, enum: ['upi', 'card'], required: true },
  status: { type: String, enum: ['success', 'failed'], required: true },
  transactionId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

paymentSchema.plugin(sandboxScope);

export default mongoose.model('Payment', paymentSchema);
