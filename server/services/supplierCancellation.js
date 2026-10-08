// Supplier-initiated cancellations and reschedules (prd.md → Workflows 6–8, 28). Refunds are always
// the amount actually paid, in full; offer redemptions are restored; travellers get a receipt.
// Bulk work is done in bounded, idempotent batches (bulkWrite + insertMany), so a departure with
// many bookings never needs one query per booking, and an interrupted run is finished later.
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Booking from '../models/Booking.js';
import Flight from '../models/Flight.js';
import Notification from '../models/Notification.js';
import Offer from '../models/Offer.js';
import { currentContext } from '../utils/context.js';
import { formatInr } from '../utils/format.js';
import { releaseInventory } from './bookingService.js';
import { notifyUser } from './notify.js';
import { restoreRedemption } from './offers.js';

export const BATCH_SIZE = 50;
export const receiptNumber = () => `RF${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
const sandboxFilter = () => ({ sandboxId: currentContext()?.sandboxId ?? null }); // bulkWrite isn't auto-scoped

const findAnother = (booking) =>
  booking.type === 'flight'
    ? `/flights?origin=${booking.itemSummary.origin}&destination=${booking.itemSummary.destination}&date=${new Date(new Date(booking.travelDates.start).getTime() + 5.5 * 3600e3).toISOString().slice(0, 10)}`
    : `/hotels?city=${encodeURIComponent(booking.itemSummary.destination || '')}`;

function receiptBody(booking, refund, why) {
  const offer = booking.offer ? ` Your ${booking.offer.title} offer (−${formatInr(booking.offer.amount)}) was applied, so the refund is the amount you actually paid, and the offer is available to use again.` : '';
  return `${why} ${formatInr(refund)} will be refunded in full (simulated).${offer}`;
}

/** Cancels one booking on the supplier's side (hotel reservations, or single bookings). */
export async function cancelOneBySupplier(bookingId, { reason }) {
  const now = new Date();
  const booking = await Booking.findOne({ _id: bookingId, status: 'confirmed' }).lean();
  if (!booking) return null;
  const refund = booking.fareBreakdown.total;
  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, status: 'confirmed' },
    {
      $set: {
        status: 'cancelled',
        cancellation: { cancelledAt: now, by: 'supplier', reason, refundAmount: refund, feeRetained: 0, receiptNo: receiptNumber(), redemptionRestored: Boolean(booking.offer), refundStatus: 'simulated' },
      },
    },
    { returnDocument: 'after' },
  ).lean();
  if (!updated) return null; // another request got there first
  await releaseInventory(booking);
  if (booking.offer?.offerId) await restoreRedemption(booking.offer.offerId);
  await notifyUser(booking.userId, {
    type: 'booking.cancelled_by_supplier',
    title: `${booking.type === 'flight' ? 'The airline' : 'The hotel'} cancelled ${booking.bookingReference}`,
    body: receiptBody(booking, refund, `${booking.itemSummary.title} was cancelled${reason ? ` (${reason})` : ''}.`),
    link: findAnother(booking),
  });
  return updated;
}

/**
 * Cancels every confirmed booking on a cancelled departure, in batches. Safe to call again:
 * only bookings still confirmed are touched, so nothing is refunded twice.
 */
export async function runDepartureCancellation(flightId, { deadline = Date.now() + 200 * 1000 } = {}) {
  const flight = await Flight.findById(flightId).lean();
  if (!flight || flight.cancellationJob?.state !== 'pending') return { done: true, processed: 0 };
  const reason = flight.cancellationJob.reason || 'The airline cancelled this flight';
  let processed = 0;
  while (Date.now() < deadline) {
    const batch = await Booking.find({ type: 'flight', itemId: flight._id, status: 'confirmed' }).limit(BATCH_SIZE).lean();
    if (!batch.length) {
      await Flight.updateOne({ _id: flight._id }, { $set: { 'cancellationJob.state': 'done' } });
      return { done: true, processed };
    }
    const now = new Date();
    const result = await Booking.bulkWrite(
      batch.map((b) => ({
        updateOne: {
          filter: { _id: b._id, status: 'confirmed', ...sandboxFilter() },
          update: {
            $set: {
              status: 'cancelled',
              cancellation: { cancelledAt: now, by: 'supplier', reason, refundAmount: b.fareBreakdown.total, feeRetained: 0, receiptNo: receiptNumber(), redemptionRestored: Boolean(b.offer), refundStatus: 'simulated' },
            },
          },
        },
      })),
    );
    // Offer redemptions come back, grouped per offer.
    const perOffer = {};
    for (const b of batch) if (b.offer?.offerId) perOffer[b.offer.offerId] = (perOffer[b.offer.offerId] || 0) + 1;
    if (Object.keys(perOffer).length) {
      await Offer.bulkWrite(
        Object.entries(perOffer).map(([id, n]) => ({
          updateOne: { filter: { _id: new mongoose.Types.ObjectId(id), ...sandboxFilter() }, update: { $inc: { redemptions: -n } } },
        })),
      );
      await Offer.updateMany({ _id: { $in: Object.keys(perOffer) }, status: 'exhausted', $expr: { $or: [{ $eq: ['$redemptionLimit', null] }, { $lt: ['$redemptions', '$redemptionLimit'] }] } }, { $set: { status: 'active', endNotified: false } });
    }
    await Notification.insertMany(
      batch.map((b) => ({
        userId: b.userId,
        type: 'booking.cancelled_by_supplier',
        title: `The airline cancelled ${b.bookingReference}`,
        body: receiptBody(b, b.fareBreakdown.total, `${b.itemSummary.title} on ${new Date(b.travelDates.start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })} was cancelled by ${flight.airline}.`),
        link: findAnother(b),
      })),
    );
    processed += result.modifiedCount;
    await Flight.updateOne({ _id: flight._id }, { $inc: { 'cancellationJob.processed': result.modifiedCount } });
  }
  return { done: false, processed };
}

// Daily job: finish any cancellation that was interrupted.
export async function resumeCancellations() {
  const pending = await Flight.find({ 'cancellationJob.state': 'pending' }, { _id: 1 }).limit(20).lean();
  let processed = 0;
  for (const f of pending) processed += (await runDepartureCancellation(f._id)).processed;
  return processed;
}

/**
 * Moves a departure to a new time and tells its travellers, who may keep the new time or cancel for
 * a full refund until 24 hours before the new departure (or until departure, if that's sooner).
 */
export async function rescheduleDeparture(flight, newDeparture) {
  const now = new Date();
  const newArrival = new Date(newDeparture.getTime() + flight.durationMinutes * 60000);
  const respondBy = new Date(Math.max(now.getTime(), newDeparture.getTime() - 24 * 3600e3));
  const finalRespondBy = respondBy >= newDeparture ? newDeparture : respondBy;
  const previous = flight.scheduleChange?.previousDeparture ? flight.scheduleChange : { previousDeparture: flight.departureTime, previousArrival: flight.arrivalTime };
  await Flight.updateOne(
    { _id: flight._id },
    { $set: { departureTime: newDeparture, arrivalTime: newArrival, scheduleChange: { previousDeparture: previous.previousDeparture, previousArrival: previous.previousArrival, changedAt: now } } },
  );
  const bookings = await Booking.find({ type: 'flight', itemId: flight._id, status: 'confirmed' }, { _id: 1, userId: 1, bookingReference: 1, travelDates: 1, reschedule: 1 }).lean();
  if (bookings.length) {
    await Booking.bulkWrite(
      bookings.map((b) => ({
        updateOne: {
          filter: { _id: b._id, status: 'confirmed', ...sandboxFilter() },
          update: {
            $set: {
              travelDates: { start: newDeparture, end: newArrival },
              reschedule: { previousStart: b.reschedule?.previousStart || b.travelDates.start, previousEnd: b.reschedule?.previousEnd || b.travelDates.end, changedAt: now, respondBy: finalRespondBy, decision: 'pending' },
            },
          },
        },
      })),
    );
    const when = newDeparture.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
    await Notification.insertMany(
      bookings.map((b) => ({
        userId: b.userId,
        type: 'booking.rescheduled',
        title: `Schedule change · ${b.bookingReference}`,
        body: `${flight.airline} ${flight.flightNumber} now departs ${when}. Keep the new time, or cancel for a full refund until ${finalRespondBy.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}.`,
        link: '/bookings',
      })),
    );
  }
  return { affected: bookings.length, respondBy: finalRespondBy };
}

// Daily job: unanswered schedule changes past their deadline are kept.
export async function closeRescheduleWindows({ now = Date.now() } = {}) {
  const result = await Booking.updateMany({ 'reschedule.decision': 'pending', 'reschedule.respondBy': { $lt: new Date(now) } }, { $set: { 'reschedule.decision': 'kept' } });
  return result.modifiedCount;
}

