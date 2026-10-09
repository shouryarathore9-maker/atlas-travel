import mongoose from 'mongoose';
import { sandboxScope } from './plugins/sandboxScope.js';

const { Mixed, ObjectId } = mongoose.Schema.Types;

const travellerSchema = new mongoose.Schema(
  {
    firstName: String,
    lastName: String,
    name: String, // "First Last" — kept for display and Phase 1 bookings
    ageCategory: { type: String, enum: ['adult', 'child', 'infant'] },
    seat: String,
    meal: String,
    ticketNumber: String, // flights: simulated e-ticket number
  },
  { _id: false },
);

const bookingSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: 'User', required: true, index: true },
    supplierId: { type: ObjectId, ref: 'Supplier', default: null, index: true },
    type: { type: String, enum: ['flight', 'hotel'], required: true },
    itemId: { type: ObjectId, required: true, index: true },
    bookingReference: { type: String, required: true, unique: true },
    pnr: { type: String, default: null }, // flights: airline-style PNR
    selection: {
      fareType: String, // flight
      cabin: String, // flight
      roomTypeName: String, // hotel
      rooms: Number, // hotel
      ratePlan: String, // hotel: flexible | nonrefundable
      breakfast: Boolean, // hotel: breakfast add-on chosen
      breakfastIncluded: Boolean, // hotel: the room type includes breakfast
    },
    travelDates: { start: Date, end: Date },
    travellers: [travellerSchema],
    contact: { email: String, phone: String },
    specialRequest: {
      text: String,
      reply: {
        status: { type: String, enum: ['accepted', 'cannot'] },
        comment: String,
        at: Date,
        by: String,
      },
    },
    // discounts = the offer amount (0 without one). Seat/meal/breakfast detail for display.
    fareBreakdown: {
      base: Number,
      infantFees: { type: Number, default: 0 },
      seatCharges: { type: Number, default: 0 },
      mealCharges: { type: Number, default: 0 },
      breakfast: { type: Number, default: 0 },
      addons: Number,
      discounts: { type: Number, default: 0 },
      taxes: Number,
      total: Number,
    },
    offer: {
      type: new mongoose.Schema({ offerId: ObjectId, code: String, title: String, amount: Number, funder: String, supplierId: ObjectId }, { _id: false }),
      default: null,
    },
    pricing: { type: Mixed, default: null }, // frozen engine output: unit price, nights, factors, engine version
    // Terms frozen at booking so later template edits never change what the traveller agreed to.
    policySnapshot: {
      templateKey: String,
      templateName: String,
      terms: String,
      freeUntil: Date,
      feeAfterCutoff: Number,
      nonRefundable: Boolean,
    },
    itemSummary: { title: String, subtitle: String, image: String, origin: String, destination: String },
    status: { type: String, enum: ['confirmed', 'cancelled'], default: 'confirmed' },
    idempotencyKey: { type: String },
    paymentId: { type: ObjectId, ref: 'Payment' },
    cancellation: {
      cancelledAt: Date,
      by: { type: String, enum: ['traveller', 'supplier'] },
      reason: String,
      refundAmount: Number,
      feeRetained: Number,
      receiptNo: String,
      redemptionRestored: Boolean,
      refundStatus: { type: String, enum: ['simulated'] },
    },
    reschedule: {
      type: new mongoose.Schema(
        { previousStart: Date, previousEnd: Date, changedAt: Date, respondBy: Date, decision: { type: String, enum: ['pending', 'kept', 'cancelled'] } },
        { _id: false },
      ),
      default: null,
    },
    checkIn: {
      type: new mongoose.Schema(
        { at: Date, passes: [{ _id: false, travellerIndex: Number, seat: String, gate: String, boardingTime: Date, sequence: Number }] },
        { _id: false },
      ),
      default: null,
    },
    settlement: { type: new mongoose.Schema({ statementId: ObjectId, period: String }, { _id: false }), default: null },
    isSynthetic: { type: Boolean, default: false }, // seeded history (never touches live inventory)
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

bookingSchema.plugin(sandboxScope);
bookingSchema.index({ type: 1, status: 1, 'travelDates.end': 1 });
bookingSchema.index({ supplierId: 1, createdAt: -1 });
bookingSchema.index({ createdAt: -1 });
bookingSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });

export default mongoose.model('Booking', bookingSchema);
