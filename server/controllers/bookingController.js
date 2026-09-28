import mongoose from 'mongoose';
import Booking from '../models/Booking.js';
import { HttpError } from '../utils/httpError.js';
import { computeRefund, releaseInventory } from '../services/bookingService.js';

export async function listMyBookings(req, res) {
  const bookings = await Booking.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ bookings });
}

// Looks up by booking reference (what the confirmation URL uses) or by id.
export async function getMyBooking(req, res) {
  const { key } = req.params;
  const filter = mongoose.isValidObjectId(key) ? { _id: key } : { bookingReference: key.toUpperCase() };
  const booking = await Booking.findOne({ ...filter, userId: req.user._id }).lean();
  if (!booking) throw new HttpError(404, 'We could not find that booking.', 'NOT_FOUND');
  res.json({ booking });
}

export async function cancelBooking(req, res) {
  const booking = await Booking.findOne({ _id: req.params.id, userId: req.user._id });
  // Other users' bookings look exactly like missing ones.
  if (!booking) throw new HttpError(404, 'We could not find that booking.', 'NOT_FOUND');
  if (booking.status !== 'confirmed') throw new HttpError(400, 'This booking is already cancelled.', 'NOT_CANCELLABLE');
  if (new Date(booking.travelDates.start) <= new Date()) {
    throw new HttpError(400, 'Trips that have already started cannot be cancelled online.', 'NOT_CANCELLABLE');
  }

  const now = new Date();
  const refundAmount = computeRefund(booking, now);
  // Conditional update guards against a double cancel racing itself.
  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, status: 'confirmed' },
    { $set: { status: 'cancelled', cancellation: { cancelledAt: now, refundAmount, refundStatus: 'simulated' } } },
    { returnDocument: 'after' },
  ).lean();
  if (!updated) throw new HttpError(400, 'This booking is already cancelled.', 'NOT_CANCELLABLE');

  await releaseInventory(booking);
  res.json({ booking: updated });
}
