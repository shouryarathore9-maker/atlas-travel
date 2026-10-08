import mongoose from 'mongoose';
import { z } from 'zod';
import Booking from '../models/Booking.js';
import Flight from '../models/Flight.js';
import Hotel from '../models/Hotel.js';
import Payment from '../models/Payment.js';
import { istMidnight } from '../utils/dates.js';
import { HttpError } from '../utils/httpError.js';
import { personName } from '../utils/names.js';
import { dateString } from '../utils/query.js';
import { notifySupplier, notifyUser } from '../services/notify.js';
import { formatInr } from '../utils/format.js';
import {
  generateReference,
  generateTransactionId,
  priceFlight,
  priceHotel,
  releaseInventory,
  reserveInventory,
} from '../services/bookingService.js';

const objectId = z.string().refine((id) => mongoose.isValidObjectId(id), 'Invalid item id');
const travellerName = personName();
const contactSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  phone: z.string().trim().regex(/^\d{10}$/, 'Enter a 10-digit mobile number'),
});

const flightBookingSchema = z.object({
  type: z.literal('flight'),
  itemId: objectId,
  fareType: z.string().trim().min(1),
  travellers: z
    .array(
      z.object({
        name: travellerName,
        ageCategory: z.enum(['adult', 'child']),
        seat: z.string().trim().toUpperCase().optional().default(''),
        meal: z.string().trim().max(80).optional().default(''),
      }),
    )
    .min(1, 'Add at least one traveller')
    .max(9),
  contact: contactSchema,
});

const hotelBookingSchema = z.object({
  type: z.literal('hotel'),
  itemId: objectId,
  roomTypeName: z.string().trim().min(1),
  rooms: z.number().int().min(1).max(8),
  checkIn: dateString,
  checkOut: dateString,
  adults: z.number().int().min(1).max(24),
  children: z.number().int().min(0).max(12).default(0),
  guests: z
    .array(z.object({ name: travellerName, ageCategory: z.enum(['adult', 'child']) }))
    .min(1, 'Add at least one guest')
    .max(24),
  specialRequests: z.string().trim().max(500).optional().default(''),
  contact: contactSchema,
});

// Card/UPI details are never part of this payload: the checkout UI validates them locally and discards them.
export const mockPaymentSchema = z.object({
  idempotencyKey: z.string().min(8).max(100),
  method: z.enum(['upi', 'card']),
  simulateFailure: z.boolean().optional().default(false),
  booking: z.discriminatedUnion('type', [flightBookingSchema, hotelBookingSchema]),
});

async function buildFlightBooking(input) {
  const flight = await Flight.findById(input.itemId).lean();
  if (!flight) throw new HttpError(404, 'We could not find that flight.', 'NOT_FOUND');
  const { fareBreakdown, policySnapshot } = priceFlight(flight, input);
  return {
    type: 'flight',
    itemId: flight._id,
    supplierId: flight.supplierId ?? null,
    selection: { fareType: input.fareType },
    travelDates: { start: flight.departureTime, end: flight.arrivalTime },
    travellers: input.travellers,
    contact: input.contact,
    fareBreakdown,
    policySnapshot,
    itemSummary: {
      title: `${flight.origin.city} → ${flight.destination.city}`,
      subtitle: `${flight.airline} ${flight.flightNumber} · ${input.fareType}`,
      origin: flight.origin.code,
      destination: flight.destination.code,
    },
  };
}

async function buildHotelBooking(input) {
  const hotel = await Hotel.findById(input.itemId).lean();
  if (!hotel) throw new HttpError(404, 'We could not find that hotel.', 'NOT_FOUND');
  const { fareBreakdown, policySnapshot, nights } = priceHotel(hotel, input);
  return {
    type: 'hotel',
    itemId: hotel._id,
    supplierId: hotel.supplierId ?? null,
    selection: { roomTypeName: input.roomTypeName, rooms: input.rooms },
    travelDates: { start: istMidnight(input.checkIn), end: istMidnight(input.checkOut) },
    travellers: input.guests.map((g, i) => ({ ...g, specialRequests: i === 0 ? input.specialRequests : '' })),
    contact: input.contact,
    fareBreakdown,
    policySnapshot,
    itemSummary: {
      title: hotel.name,
      subtitle: `${input.roomTypeName} · ${input.rooms} room${input.rooms > 1 ? 's' : ''} · ${nights} night${nights > 1 ? 's' : ''}`,
      image: hotel.photos?.[0] || '',
      destination: hotel.city,
    },
  };
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

// prd.md → Booking limits: at most this many upcoming hotel stays per account (hotel rooms are a
// simple counter held until check-out, so this keeps one account from tying up a hotel).
export const MAX_UPCOMING_STAYS = 5;

export async function mockPayment(req, res) {
  const { idempotencyKey, method, simulateFailure, booking: input } = req.validated.body;
  const userId = req.user._id;

  // A retried request (double-click, refresh, flaky network) returns the booking it already made.
  const existing = await Booking.findOne({ userId, idempotencyKey });
  if (existing) return res.status(200).json({ booking: existing, payment: { status: 'success' } });

  if (req.user.role !== 'traveler') {
    throw new HttpError(403, 'Staff accounts can’t make bookings. Sign in with a traveller account to book.', 'STAFF_CANNOT_BOOK');
  }
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

  let draft;
  try {
    draft = input.type === 'flight' ? await buildFlightBooking(input) : await buildHotelBooking(input);
  } catch (err) {
    // An identical request (double-click, retry) may have just booked these seats/rooms itself.
    // In that case answer with its booking rather than a misleading "no longer available".
    const winner = await awaitConcurrentBooking(userId, idempotencyKey);
    if (winner) return res.status(200).json({ booking: winner, payment: { status: 'success' } });
    throw err;
  }
  const amount = draft.fareBreakdown.total;

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
  let booking;
  try {
    booking = await Booking.create({ ...draft, userId, idempotencyKey, bookingReference: generateReference() });
  } catch (err) {
    await releaseInventory(draft);
    if (err.code === 11000 && err.keyPattern?.idempotencyKey) {
      const winner = await Booking.findOne({ userId, idempotencyKey });
      return res.status(200).json({ booking: winner, payment: { status: 'success' } });
    }
    throw err;
  }

  const payment = await Payment.create({
    userId,
    bookingId: booking._id,
    amount,
    method,
    status: 'success',
    transactionId: generateTransactionId(),
  });
  booking.paymentId = payment._id;
  await booking.save();

  await notifySupplier(booking.supplierId, {
    type: 'booking.new',
    title: `New ${booking.type === 'flight' ? 'booking' : 'reservation'} ${booking.bookingReference}`,
    body: `${booking.itemSummary.title} · ${booking.itemSummary.subtitle} · ${formatInr(booking.fareBreakdown.total)}`,
    link: booking.type === 'flight' ? '/supplier/departures' : '/supplier/hotel',
  });
  await notifyUser(userId, {
    type: 'booking.confirmed',
    title: `Booking confirmed · ${booking.bookingReference}`,
    body: `${booking.itemSummary.title} · ${formatInr(booking.fareBreakdown.total)} paid`,
    link: `/bookings/${booking.bookingReference}/confirmation`,
  });

  res.status(201).json({ booking, payment: { status: 'success', transactionId: payment.transactionId } });
}
