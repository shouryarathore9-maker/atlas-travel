// Supplier operations (prd.md → Workflows 3, 4, 6–8): passenger lists and reservations, cancelling
// or rescheduling a departure, cancelling a reservation, and answering special requests.
// Always scoped to req.supplierId; one audit entry per action (with a count when many bookings move).
import mongoose from 'mongoose';
import { z } from 'zod';
import Booking from '../models/Booking.js';
import Flight from '../models/Flight.js';
import { AIRCRAFT } from '../services/aircraft.js';
import { audit } from '../services/audit.js';
import { notifyUser } from '../services/notify.js';
import { cancelOneBySupplier, rescheduleDeparture, runDepartureCancellation } from '../services/supplierCancellation.js';
import { DAY_MS } from '../utils/dates.js';
import { HttpError } from '../utils/httpError.js';
import { pagination } from '../utils/query.js';

const isId = (id) => mongoose.isValidObjectId(id);
const reason = z.string().trim().min(5, 'Give a short reason (at least 5 characters)').max(300);

async function ownDeparture(req) {
  if (!isId(req.params.id)) throw new HttpError(404, 'That departure was not found.', 'NOT_FOUND');
  const flight = await Flight.findOne({ _id: req.params.id, supplierId: req.supplierId }).lean();
  if (!flight) throw new HttpError(404, 'That departure was not found.', 'NOT_FOUND');
  return flight;
}

const bookingRow = (b) => ({
  _id: b._id,
  bookingReference: b.bookingReference,
  pnr: b.pnr,
  status: b.status,
  travellers: b.travellers,
  selection: b.selection,
  travelDates: b.travelDates,
  specialRequest: b.specialRequest?.text ? b.specialRequest : null,
  offer: b.offer ? { title: b.offer.title, code: b.offer.code, amount: b.offer.amount, funder: b.offer.funder } : null,
  total: b.fareBreakdown.total,
  cancellation: b.cancellation,
  reschedule: b.reschedule,
  checkedIn: Boolean(b.checkIn),
  createdAt: b.createdAt,
});

// Departure detail with its passenger list.
export async function getDeparture(req, res) {
  const flight = await ownDeparture(req);
  const bookings = await Booking.find({ type: 'flight', itemId: flight._id }).sort({ createdAt: 1 }).lean();
  res.json({
    flight: { ...flight, aircraftName: AIRCRAFT[flight.aircraftConfig]?.label, seatMap: undefined },
    bookings: bookings.map(bookingRow),
    affected: { bookings: bookings.filter((b) => b.status === 'confirmed').length, refunds: bookings.filter((b) => b.status === 'confirmed').reduce((s, b) => s + b.fareBreakdown.total, 0) },
  });
}

export const cancelSchema = z.object({ reason });

export async function cancelDeparture(req, res) {
  const flight = await ownDeparture(req);
  if (flight.status === 'cancelled' && flight.cancellationJob?.state === 'done') throw new HttpError(409, 'This departure is already cancelled.', 'NOT_ALLOWED');
  if (new Date(flight.departureTime) <= new Date()) throw new HttpError(409, 'This flight has already departed.', 'NOT_ALLOWED');
  const confirmed = await Booking.find({ type: 'flight', itemId: flight._id, status: 'confirmed' }, { fareBreakdown: 1 }).lean();
  if (flight.status !== 'cancelled') {
    // Cancel first (so nobody can book it), then refund in batches; the daily job finishes an interrupted run.
    await Flight.updateOne(
      { _id: flight._id, status: 'scheduled' },
      { $set: { status: 'cancelled', cancellationJob: { state: 'pending', reason: req.validated.body.reason, startedAt: new Date(), processed: 0 } } },
    );
    await audit(req, {
      action: 'departure.cancel',
      target: { type: 'flight', id: flight._id, label: `${flight.flightNumber} ${flight.date}` },
      before: { status: 'scheduled' },
      after: { status: 'cancelled', reason: req.validated.body.reason, refunds: confirmed.reduce((s, b) => s + b.fareBreakdown.total, 0) },
      count: confirmed.length,
    });
  }
  const result = await runDepartureCancellation(flight._id);
  res.json({ cancelled: true, bookingsRefunded: result.processed, finished: result.done });
}

export const rescheduleSchema = z.object({
  departureTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/, 'Choose a date and time'),
});

export async function rescheduleDepartureHandler(req, res) {
  const flight = await ownDeparture(req);
  if (flight.status === 'cancelled') throw new HttpError(409, 'A cancelled departure can’t be rescheduled.', 'NOT_ALLOWED');
  if (new Date(flight.departureTime) <= new Date()) throw new HttpError(409, 'This flight has already departed.', 'NOT_ALLOWED');
  const newDeparture = new Date(`${req.validated.body.departureTime}:00+05:30`);
  const original = flight.scheduleChange?.previousDeparture || flight.departureTime;
  if (Math.abs(newDeparture - new Date(original)) > DAY_MS) throw new HttpError(400, 'A departure can move by at most one day from its original time.', 'VALIDATION_ERROR');
  if (newDeparture.getTime() < Date.now() + 2 * 3600e3) throw new HttpError(400, 'The new time must be at least 2 hours from now.', 'VALIDATION_ERROR');
  if (newDeparture.getTime() === new Date(flight.departureTime).getTime()) throw new HttpError(400, 'That’s the current departure time.', 'VALIDATION_ERROR');
  const result = await rescheduleDeparture(flight, newDeparture);
  await audit(req, {
    action: 'departure.reschedule',
    target: { type: 'flight', id: flight._id, label: `${flight.flightNumber} ${flight.date}` },
    before: { departureTime: flight.departureTime },
    after: { departureTime: newDeparture },
    count: result.affected,
  });
  res.json({ affected: result.affected, respondBy: result.respondBy });
}

// ---------- Hotel reservations ----------

export const reservationsQuerySchema = z.object({ when: z.enum(['upcoming', 'past', 'all']).default('upcoming'), ...pagination });

export async function listReservations(req, res) {
  const { when, page, limit } = req.validated.query;
  const now = new Date();
  const filter = {
    supplierId: req.supplierId,
    ...(when === 'upcoming' && { 'travelDates.end': { $gte: now } }),
    ...(when === 'past' && { 'travelDates.end': { $lt: now } }),
  };
  const [items, total] = await Promise.all([
    Booking.find(filter).sort({ 'travelDates.start': when === 'past' ? -1 : 1 }).skip((page - 1) * limit).limit(limit).lean(),
    Booking.countDocuments(filter),
  ]);
  res.json({ items: items.map(bookingRow), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
}

export async function cancelReservation(req, res) {
  if (!isId(req.params.id)) throw new HttpError(404, 'That reservation was not found.', 'NOT_FOUND');
  const booking = await Booking.findOne({ _id: req.params.id, supplierId: req.supplierId, type: 'hotel' }).lean();
  if (!booking) throw new HttpError(404, 'That reservation was not found.', 'NOT_FOUND');
  if (booking.status !== 'confirmed') throw new HttpError(409, 'This reservation is already cancelled.', 'NOT_ALLOWED');
  if (new Date(booking.travelDates.start) <= new Date()) throw new HttpError(409, 'Only reservations that haven’t started can be cancelled.', 'NOT_ALLOWED');
  const updated = await cancelOneBySupplier(booking._id, { reason: req.validated.body.reason });
  if (!updated) throw new HttpError(409, 'This reservation is already cancelled.', 'NOT_ALLOWED');
  await audit(req, {
    action: 'reservation.cancel',
    target: { type: 'booking', id: booking._id, label: booking.bookingReference },
    before: { status: 'confirmed' },
    after: { status: 'cancelled', reason: req.validated.body.reason, refund: booking.fareBreakdown.total },
    count: 1,
  });
  res.json({ booking: bookingRow(updated) });
}

// ---------- Special requests ----------

export const requestsQuerySchema = z.object({ status: z.enum(['open', 'answered']).default('open') });

export async function listSpecialRequests(req, res) {
  const { status } = req.validated.query;
  const items = await Booking.find({
    supplierId: req.supplierId,
    'specialRequest.text': { $exists: true, $ne: '' },
    'specialRequest.reply.status': status === 'open' ? { $exists: false } : { $exists: true },
    ...(status === 'open' && { status: 'confirmed', 'travelDates.end': { $gte: new Date() } }),
  })
    .sort({ 'travelDates.start': 1 })
    .limit(100)
    .lean();
  res.json({ items: items.map((b) => ({ ...bookingRow(b), title: b.itemSummary.title, subtitle: b.itemSummary.subtitle })) });
}

export const replySchema = z.object({ status: z.enum(['accepted', 'cannot']), comment: z.string().trim().max(300, 'At most 300 characters').default('') });

export async function replySpecialRequest(req, res) {
  if (!isId(req.params.bookingId)) throw new HttpError(404, 'That request was not found.', 'NOT_FOUND');
  const { status, comment } = req.validated.body;
  // A request can be answered once.
  const updated = await Booking.findOneAndUpdate(
    { _id: req.params.bookingId, supplierId: req.supplierId, 'specialRequest.text': { $exists: true }, 'specialRequest.reply.status': { $exists: false } },
    { $set: { 'specialRequest.reply': { status, comment, at: new Date(), by: req.supplier.name } } },
    { returnDocument: 'after' },
  ).lean();
  if (!updated) {
    const exists = await Booking.exists({ _id: req.params.bookingId, supplierId: req.supplierId });
    throw exists ? new HttpError(409, 'This request has already been answered.', 'ALREADY_ANSWERED') : new HttpError(404, 'That request was not found.', 'NOT_FOUND');
  }
  await notifyUser(updated.userId, {
    type: 'request.reply',
    title: `${req.supplier.name} ${status === 'accepted' ? 'accepted' : 'can’t accommodate'} your request · ${updated.bookingReference}`,
    body: comment || updated.specialRequest.text.slice(0, 120),
    link: `/bookings/${updated.bookingReference}/confirmation`,
  });
  await audit(req, {
    action: 'special_request.reply',
    target: { type: 'booking', id: updated._id, label: updated.bookingReference },
    after: { status, comment },
  });
  res.json({ booking: bookingRow(updated) });
}

