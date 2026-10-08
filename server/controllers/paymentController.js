import mongoose from 'mongoose';
import { z } from 'zod';
import Booking from '../models/Booking.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';
import { HttpError } from '../utils/httpError.js';
import { formatInr } from '../utils/format.js';
import { splitName } from '../utils/names.js';
import { dateString } from '../utils/query.js';
import {
  generatePnr,
  generateReference,
  generateTransactionId,
  normaliseName,
  releaseInventory,
  reserveInventory,
  ticketNumber,
} from '../services/bookingService.js';
import { notifySupplier, notifyUser } from '../services/notify.js';
import { track } from '../services/analytics.js';
import { claimRedemption } from '../services/offers.js';
import { quoteBooking, quoteView } from '../services/quote.js';

const objectId = z.string().refine((id) => mongoose.isValidObjectId(id), 'Invalid item id');
const contactSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  phone: z.string().trim().regex(/^\d{10}$/, 'Enter a 10-digit mobile number'),
});
const specialRequest = z.string().trim().max(500, 'Special requests can be at most 500 characters').optional().default('');

const flightBooking = z.object({
  type: z.literal('flight'),
  itemId: objectId,
  fareType: z.string().trim().min(1).max(40),
  travellers: z
    .array(
      splitName.and(
        z.object({
          ageCategory: z.enum(['adult', 'child', 'infant']),
          seat: z.string().trim().toUpperCase().max(4).optional().default(''),
          meal: z.string().trim().max(80).optional().default(''),
        }),
      ),
    )
    .min(1, 'Add at least one traveller')
    .max(18),
  specialRequest,
});

const hotelBooking = z.object({
  type: z.literal('hotel'),
  itemId: objectId,
  roomTypeName: z.string().trim().min(1).max(60),
  ratePlan: z.enum(['flexible', 'nonrefundable']).default('flexible'),
  breakfast: z.boolean().optional().default(false),
  rooms: z.number().int().min(1).max(8),
  checkIn: dateString,
  checkOut: dateString,
  adults: z.number().int().min(1).max(24),
  children: z.number().int().min(0).max(12).default(0),
  guests: z.array(splitName).min(1, 'Add the lead guest').max(1),
  specialRequest,
});

const bookingInput = z.discriminatedUnion('type', [flightBooking, hotelBooking]);
const offerCode = z.string().trim().toUpperCase().max(20).optional().default('');

export const quoteSchema = z.object({ booking: bookingInput, offerCode });

// Card/UPI details are never part of this payload: the checkout UI validates them locally and discards them.
export const mockPaymentSchema = z.object({
  idempotencyKey: z.string().min(8).max(100),
  method: z.enum(['upi', 'card']),
  simulateFailure: z.boolean().optional().default(false),
  expectedTotal: z.number().int().min(0).optional(), // the total the traveller saw
  offerCode,
  saveTravellers: z.boolean().optional().default(false),
  booking: bookingInput.and(z.object({ contact: contactSchema })),
});

// prd.md → Booking limits: at most this many upcoming hotel stays per account.
export const MAX_UPCOMING_STAYS = 5;

function assertCanBook(user) {
  if (user.role !== 'traveler') {
    throw new HttpError(403, 'Staff accounts can’t make bookings. Sign in with a traveller account to book.', 'STAFF_CANNOT_BOOK');
  }
}

export async function quote(req, res) {
  assertCanBook(req.user);
  const { booking, offerCode: code } = req.validated.body;
  const quoted = await quoteBooking(booking, { userId: req.user._id, offerCode: code });
  await track('checkout_start', booking.type);
  res.json(quoteView(quoted));
}

// The winning request reserves inventory a few milliseconds before its booking is saved,
// so poll briefly for it before concluding the failure is genuine.
async function awaitConcurrentBooking(userId, idempotencyKey, attempts = 5, delayMs = 100) {
  for (let i = 0; i < attempts; i++) {
    const booking = await Booking.findOne({ userId, idempotencyKey });
    if (booking) return booking;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return null;
}

function priceChanged(res, previous, quoted, reason) {
  return res.status(409).json({
    error: {
      code: 'PRICE_CHANGED',
      message: `The price changed from ${formatInr(previous)} to ${formatInr(quoted.draft.fareBreakdown.total)}. No payment was taken — check the new total and pay again.`,
      reason,
    },
    quote: quoteView(quoted),
  });
}

async function saveTravellersFor(user, travellers) {
  const saved = user.savedTravellers || [];
  const have = new Set(saved.map((t) => normaliseName(t.firstName, t.lastName)));
  const fresh = travellers
    .filter((t) => !have.has(normaliseName(t.firstName, t.lastName)))
    .map((t) => ({ firstName: t.firstName, lastName: t.lastName, ageCategory: t.ageCategory }));
  if (!fresh.length) return;
  await User.updateOne({ _id: user._id }, { $push: { savedTravellers: { $each: fresh, $slice: 20 } } });
}

export async function mockPayment(req, res) {
  const { idempotencyKey, method, simulateFailure, expectedTotal, offerCode: code, saveTravellers, booking: input } = req.validated.body;
  const userId = req.user._id;

  // A retried request (double-click, refresh, flaky network) returns the booking it already made.
  const existing = await Booking.findOne({ userId, idempotencyKey });
  if (existing) return res.status(200).json({ booking: existing, payment: { status: 'success' } });

  assertCanBook(req.user);
  if (input.type === 'hotel') {
    const upcomingStays = await Booking.countDocuments({ userId, type: 'hotel', status: 'confirmed', 'travelDates.end': { $gt: new Date() } });
    if (upcomingStays >= MAX_UPCOMING_STAYS) {
      throw new HttpError(
        409,
        `You already have ${MAX_UPCOMING_STAYS} upcoming stays booked. You can book another once one of them is completed or cancelled.`,
        'STAY_LIMIT',
      );
    }
  }

  let quoted;
  try {
    quoted = await quoteBooking(input, { userId, offerCode: code });
  } catch (err) {
    // An identical request (double-click, retry) may have just booked these seats/rooms itself.
    const winner = await awaitConcurrentBooking(userId, idempotencyKey);
    if (winner) return res.status(200).json({ booking: winner, payment: { status: 'success' } });
    throw err;
  }
  const { draft } = quoted;
  const amount = draft.fareBreakdown.total;
  await track('pay_attempt', input.type);

  // The server re-prices at payment; a different total is never charged silently.
  if (expectedTotal !== undefined && expectedTotal !== amount) {
    return priceChanged(res, expectedTotal, quoted, quoted.codeError || 'Prices moved since you last looked.');
  }

  const failureRate = Number(process.env.MOCK_PAYMENT_FAILURE_RATE) || 0;
  if (simulateFailure || Math.random() < failureRate) {
    const payment = await Payment.create({ userId, amount, method, status: 'failed', transactionId: generateTransactionId() });
    return res.status(402).json({
      error: { message: 'Your payment did not go through. No money was taken — please try again.', code: 'PAYMENT_FAILED' },
      payment: { status: 'failed', transactionId: payment.transactionId },
    });
  }

  try {
    await reserveInventory(draft);
  } catch (err) {
    const winner = await awaitConcurrentBooking(userId, idempotencyKey);
    if (winner) return res.status(200).json({ booking: winner, payment: { status: 'success' } });
    throw err;
  }

  // The redemption counts only now. If someone else took the last one, nothing is charged.
  if (draft.offer && !(await claimRedemption(draft.offer.offerId))) {
    await releaseInventory(draft);
    const requote = await quoteBooking(input, { userId });
    return priceChanged(res, amount, requote, `The ${draft.offer.code || draft.offer.title} offer has just been used up.`);
  }

  const { airlineCode, ...fields } = draft;
  const bookingId = new mongoose.Types.ObjectId();
  if (draft.type === 'flight') {
    fields.pnr = generatePnr();
    fields.travellers = fields.travellers.map((t, i) => ({ ...t, ticketNumber: ticketNumber(airlineCode, bookingId, i) }));
  }
  let booking;
  try {
    booking = await Booking.create({
      ...fields,
      _id: bookingId,
      userId,
      idempotencyKey,
      contact: input.contact,
      specialRequest: input.specialRequest ? { text: input.specialRequest } : undefined,
      bookingReference: generateReference(),
    });
  } catch (err) {
    await releaseInventory(draft);
    if (err.code === 11000 && err.keyPattern?.idempotencyKey) {
      const winner = await Booking.findOne({ userId, idempotencyKey });
      return res.status(200).json({ booking: winner, payment: { status: 'success' } });
    }
    throw err;
  }

  const payment = await Payment.create({ userId, bookingId: booking._id, amount, method, status: 'success', transactionId: generateTransactionId() });
  booking.paymentId = payment._id;
  await booking.save();

  if (saveTravellers) await saveTravellersFor(req.user, input.type === 'flight' ? input.travellers : input.guests.map((g) => ({ ...g, ageCategory: 'adult' })));

  const offerLine = booking.offer ? ` · ${booking.offer.title} −${formatInr(booking.offer.amount)} (${booking.offer.funder === 'platform' ? 'Atlas-funded' : 'your offer'})` : '';
  await notifySupplier(booking.supplierId, {
    type: 'booking.new',
    title: `New ${booking.type === 'flight' ? 'booking' : 'reservation'} ${booking.bookingReference}`,
    body: `${booking.itemSummary.title} · ${booking.itemSummary.subtitle} · ${formatInr(booking.fareBreakdown.total)}${offerLine}${booking.specialRequest?.text ? ' · has a special request' : ''}`,
    link: booking.type === 'flight' ? `/supplier/departures/${booking.itemId}` : '/supplier/reservations',
  });
  await notifyUser(userId, {
    type: 'booking.confirmed',
    title: `Booking confirmed · ${booking.bookingReference}`,
    body: `${booking.itemSummary.title} · ${formatInr(booking.fareBreakdown.total)} paid`,
    link: `/bookings/${booking.bookingReference}/confirmation`,
  });

  await track('confirmed', booking.type);
  res.status(201).json({ booking, payment: { status: 'success', transactionId: payment.transactionId } });
}
