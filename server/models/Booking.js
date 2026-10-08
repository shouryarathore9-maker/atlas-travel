import mongoose from 'mongoose';
import { sandboxScope } from './plugins/sandboxScope.js';

const bookingSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null, index: true },
    type: { type: String, enum: ['flight', 'hotel'], required: true },
    itemId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    selection: {
      fareType: String, // flight
      roomTypeName: String, // hotel
      rooms: Number, // hotel
    },
    travelDates: { start: Date, end: Date },
    travellers: [
      { _id: false, name: String, ageCategory: String, seat: String, meal: String, specialRequests: String },
    ],
    contact: { email: String, phone: String },
    fareBreakdown: { base: Number, taxes: Number, addons: Number, discounts: Number, total: Number },
    // Snapshot so a later admin edit never changes what the traveller agreed to.
    policySnapshot: { freeUntil: Date, feeAfterCutoff: Number },
    itemSummary: {
      title: String,
      subtitle: String,
      image: String,
      origin: String,
      destination: String,
    },
    status: { type: String, enum: ['confirmed', 'cancelled'], default: 'confirmed' },
    bookingReference: { type: String, required: true, unique: true },
    idempotencyKey: { type: String },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
    roomsReturned: { type: Boolean, default: false }, // hotel: rooms given back after check-out (daily job)
    isSynthetic: { type: Boolean, default: false }, // seeded history (never touches live inventory)
    cancellation: {
      cancelledAt: Date,
      refundAmount: Number,
      refundStatus: { type: String, enum: ['simulated'] },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

bookingSchema.plugin(sandboxScope);
bookingSchema.index({ type: 1, status: 1, 'travelDates.end': 1 });
bookingSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });

export default mongoose.model('Booking', bookingSchema);
