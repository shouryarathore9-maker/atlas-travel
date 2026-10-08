import mongoose from 'mongoose';
import { z } from 'zod';
import Booking from '../models/Booking.js';
import Ticket from '../models/Ticket.js';
import { HttpError } from '../utils/httpError.js';
import { computeRefund, releaseInventory } from '../services/bookingService.js';
import { notifySupplier, notifyUser } from '../services/notify.js';
import { restoreRedemption } from '../services/offers.js';
import { receiptNumber } from '../services/supplierCancellation.js';
import { checkIn, documentsFor } from '../services/travelDocs.js';
import { formatInr } from '../utils/format.js';

const notFound = () => new HttpError(404, 'We could not find that booking.', 'NOT_FOUND');

export async function listMyBookings(req, res) {
  const bookings = await Booking.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(100).lean();
  const tickets = await Ticket.find({ travellerId: req.user._id, type: 'booking_problem', bookingId: { $in: bookings.map((b) => b._id) } }, { bookingId: 1, status: 1 }).lean();
  const ticketBy = Object.fromEntries(tickets.map((t) => [String(t.bookingId), { _id: t._id, status: t.status }]));
  res.json({ bookings: bookings.map((b) => ({ ...b, ticket: ticketBy[String(b._id)] || null })) });
}

// Looks up by booking reference (what the confirmation URL uses) or by id. Owner only.
async function ownBooking(req, key = req.params.key) {
  const filter = mongoose.isValidObjectId(key) ? { _id: key } : { bookingReference: String(key).toUpperCase() };
  const booking = await Booking.findOne({ ...filter, userId: req.user._id }).lean();
  if (!booking) throw notFound();
  return booking;
}

export async function getMyBooking(req, res) {
  res.json({ booking: await ownBooking(req) });
}

const supplierLink = (booking) => (booking.type === 'flight' ? `/supplier/departures/${booking.itemId}` : '/supplier/reservations');

async function cancelAsTraveller(booking, { refundAmount, reason, restoreOffer }) {
  const now = new Date();
  // Conditional update guards against a double cancel racing itself.
  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, status: 'confirmed' },
    {
      $set: {
        status: 'cancelled',
        ...(booking.reschedule?.decision === 'pending' && { 'reschedule.decision': 'cancelled' }),
        cancellation: {
          cancelledAt: now,
          by: 'traveller',
          reason,
          refundAmount,
          feeRetained: booking.fareBreakdown.total - refundAmount,
          receiptNo: receiptNumber(),
          redemptionRestored: Boolean(restoreOffer && booking.offer),
          refundStatus: 'simulated',
        },
      },
    },
    { returnDocument: 'after' },
  ).lean();
  if (!updated) throw new HttpError(400, 'This booking is already cancelled.', 'NOT_CANCELLABLE');
  await releaseInventory(booking);
  if (restoreOffer && booking.offer?.offerId) await restoreRedemption(booking.offer.offerId);
  const offerLine = booking.offer ? ` The ${booking.offer.title} offer (−${formatInr(booking.offer.amount)}) was applied, so this is based on the ${formatInr(booking.fareBreakdown.total)} you paid.` : '';
  await notifyUser(booking.userId, {
    type: 'refund.receipt',
    title: `Refund of ${formatInr(refundAmount)} · ${booking.bookingReference}`,
    body: `You cancelled ${booking.itemSummary.title}. Receipt ${updated.cancellation.receiptNo}: ${formatInr(refundAmount)} of ${formatInr(booking.fareBreakdown.total)} will be refunded (simulated).${offerLine}`,
    link: '/bookings',
  });
  await notifySupplier(booking.supplierId, {
    type: 'booking.cancelled_by_traveller',
    title: `Cancelled by the traveller · ${booking.bookingReference}`,
    body: `${booking.itemSummary.title} · ${booking.itemSummary.subtitle}`,
    link: supplierLink(booking),
  });
  return updated;
}

function assertCancellable(booking) {
  if (booking.status !== 'confirmed') throw new HttpError(400, 'This booking is already cancelled.', 'NOT_CANCELLABLE');
  if (new Date(booking.travelDates.start) <= new Date()) {
    throw new HttpError(400, 'Trips that have already started cannot be cancelled online.', 'NOT_CANCELLABLE');
  }
}

// Traveller cancellation: the frozen terms decide the refund; the offer redemption isn't restored.
export async function cancelBooking(req, res) {
  const booking = await ownBooking(req, req.params.id);
  assertCancellable(booking);
  const booking2 = await cancelAsTraveller(booking, { refundAmount: computeRefund(booking, new Date()), reason: 'Cancelled by the traveller', restoreOffer: false });
  res.json({ booking: booking2 });
}

export const rescheduleResponseSchema = z.object({ decision: z.enum(['keep', 'cancel']) });

// After a supplier reschedule: keep the new time, or cancel for a full refund (redemption restored).
export async function respondToReschedule(req, res) {
  const booking = await ownBooking(req);
  const { decision } = req.validated.body;
  if (booking.reschedule?.decision !== 'pending') throw new HttpError(409, 'There’s no schedule change waiting for an answer on this booking.', 'NOT_ALLOWED');
  if (new Date() > new Date(booking.reschedule.respondBy)) throw new HttpError(409, 'The time to respond to this schedule change has passed.', 'TOO_LATE');
  if (decision === 'keep') {
    const updated = await Booking.findOneAndUpdate({ _id: booking._id, 'reschedule.decision': 'pending' }, { $set: { 'reschedule.decision': 'kept' } }, { returnDocument: 'after' }).lean();
    return res.json({ booking: updated });
  }
  assertCancellable(booking);
  const updated = await cancelAsTraveller(booking, { refundAmount: booking.fareBreakdown.total, reason: 'Cancelled after a schedule change', restoreOffer: true });
  res.json({ booking: updated });
}

export async function getDocuments(req, res) {
  res.json(await documentsFor(await ownBooking(req)));
}

export async function webCheckIn(req, res) {
  const booking = await ownBooking(req);
  const updated = await checkIn(booking);
  res.json(await documentsFor(updated));
}
