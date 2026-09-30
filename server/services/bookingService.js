import crypto from 'node:crypto';
import Flight from '../models/Flight.js';
import Hotel from '../models/Hotel.js';
import { DAY_MS, istMidnight, nightsBetween } from '../utils/dates.js';
import { HttpError } from '../utils/httpError.js';
import { roomFits } from '../controllers/hotelController.js';

export const FLIGHT_TAX_RATE = 0.12;
const SEAT_LETTERS = 'ABCDEFGHJK';

export function seatLabel(row, colIndex) {
  return `${row}${SEAT_LETTERS[colIndex]}`;
}

export function parseSeat(label, seatMap) {
  const match = /^(\d{1,2})([A-Z])$/.exec(label || '');
  if (!match) return null;
  const row = Number(match[1]);
  const col = SEAT_LETTERS.indexOf(match[2]);
  if (row < 1 || row > seatMap.rows || col < 0 || col >= seatMap.columns) return null;
  return { row, col };
}

// 3-3 layout: A/F window, C/D aisle, B/E middle. Other widths: edges are window, the rest middle.
export function seatType(col, columns) {
  if (col === 0 || col === columns - 1) return 'window';
  if (columns === 6 && (col === 2 || col === 3)) return 'aisle';
  return 'middle';
}

function assert(condition, message, code = 'INVALID_SELECTION') {
  if (!condition) throw new HttpError(400, message, code);
}

export function priceFlight(flight, { fareType, travellers }) {
  const fare = flight.fareOptions.find((f) => f.type === fareType);
  assert(fare, 'That fare is no longer offered on this flight.');
  assert(fare.seatsAvailable >= travellers.length, 'Not enough seats left on this fare.', 'SOLD_OUT');
  assert(new Date(flight.departureTime) > new Date(), 'This flight has already departed.');

  const seats = travellers.map((t) => t.seat).filter(Boolean);
  assert(new Set(seats).size === seats.length, 'Each traveller needs a different seat.');

  let seatCharges = 0;
  for (const seat of seats) {
    const parsed = parseSeat(seat, flight.seatMap);
    assert(parsed, `Seat ${seat} does not exist on this aircraft.`);
    assert(!flight.seatMap.unavailableSeats.includes(seat), `Seat ${seat} is no longer available.`, 'SEAT_TAKEN');
    seatCharges += flight.seatMap.seatPricing?.[seatType(parsed.col, flight.seatMap.columns)] || 0;
  }

  let mealCharges = 0;
  for (const { meal } of travellers) {
    if (!meal) continue;
    const option = flight.mealOptions.find((m) => m.name === meal);
    assert(option, `${meal} is not available on this flight.`);
    mealCharges += option.price;
  }

  const base = fare.price * travellers.length;
  const taxes = Math.round(base * FLIGHT_TAX_RATE);
  const addons = seatCharges + mealCharges;
  return {
    fare,
    seats,
    fareBreakdown: { base, taxes, addons, discounts: 0, total: base + taxes + addons },
    policySnapshot: {
      // A 0-hour window means "no free cancellation" (the fee always applies), not "free until departure".
      freeUntil:
        fare.cancellationPolicy.freeUntilHoursBeforeDeparture > 0
          ? new Date(new Date(flight.departureTime).getTime() - fare.cancellationPolicy.freeUntilHoursBeforeDeparture * 3600 * 1000)
          : null,
      feeAfterCutoff: fare.cancellationPolicy.feeAfterCutoff,
    },
  };
}

export function priceHotel(hotel, { roomTypeName, rooms, checkIn, checkOut, adults, children }) {
  const room = hotel.roomTypes.find((r) => r.name === roomTypeName);
  assert(room, 'That room type is no longer offered at this hotel.');
  const nights = nightsBetween(checkIn, checkOut);
  assert(nights >= 1, 'Check-out must be after check-in.');
  assert(nights <= 30, 'Stays are limited to 30 nights.');
  assert(istMidnight(checkIn).getTime() + DAY_MS > Date.now(), 'Check-in date is in the past.');
  assert(room.roomsAvailable >= rooms, `Only ${room.roomsAvailable} room(s) of this type are available.`, 'SOLD_OUT');
  assert(roomFits(room, { adults, children, rooms }), 'These rooms cannot hold your whole party. Add rooms or pick a larger room type.');

  const base = room.price * nights * rooms;
  const taxes = room.taxesAndFees * nights * rooms;
  return {
    room,
    nights,
    fareBreakdown: { base, taxes, addons: 0, discounts: 0, total: base + taxes },
    policySnapshot: {
      // Likewise, 0 days means the cancellation fee applies from the moment of booking.
      freeUntil:
        room.cancellationPolicy.freeUntilDaysBeforeCheckIn > 0
          ? new Date(istMidnight(checkIn).getTime() - room.cancellationPolicy.freeUntilDaysBeforeCheckIn * DAY_MS)
          : null,
      feeAfterCutoff: room.cancellationPolicy.feeAfterCutoff,
    },
  };
}

const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generateReference() {
  const bytes = crypto.randomBytes(6);
  return 'AT' + Array.from(bytes, (b) => REFERENCE_ALPHABET[b % REFERENCE_ALPHABET.length]).join('');
}

export function generateTransactionId() {
  return 'MOCKTXN' + crypto.randomBytes(6).toString('hex').toUpperCase();
}

// Atomic, conditional decrement so two people can never book the same seat or last room.
export async function reserveInventory(booking) {
  if (booking.type === 'flight') {
    const seats = booking.travellers.map((t) => t.seat).filter(Boolean);
    const result = await Flight.updateOne(
      {
        _id: booking.itemId,
        'seatMap.unavailableSeats': { $nin: seats },
        fareOptions: { $elemMatch: { type: booking.selection.fareType, seatsAvailable: { $gte: booking.travellers.length } } },
      },
      {
        $inc: { 'fareOptions.$[fare].seatsAvailable': -booking.travellers.length },
        $push: { 'seatMap.unavailableSeats': { $each: seats } },
      },
      { arrayFilters: [{ 'fare.type': booking.selection.fareType }] },
    );
    if (!result.modifiedCount) {
      throw new HttpError(409, 'Someone just booked one of those seats. Please choose again.', 'INVENTORY_CHANGED');
    }
  } else {
    const result = await Hotel.updateOne(
      { _id: booking.itemId, roomTypes: { $elemMatch: { name: booking.selection.roomTypeName, roomsAvailable: { $gte: booking.selection.rooms } } } },
      { $inc: { 'roomTypes.$[room].roomsAvailable': -booking.selection.rooms } },
      { arrayFilters: [{ 'room.name': booking.selection.roomTypeName }] },
    );
    if (!result.modifiedCount) {
      throw new HttpError(409, 'Those rooms were just booked. Please choose again.', 'INVENTORY_CHANGED');
    }
  }
}

export async function releaseInventory(booking) {
  if (booking.type === 'flight') {
    const seats = booking.travellers.map((t) => t.seat).filter(Boolean);
    await Flight.updateOne(
      { _id: booking.itemId },
      {
        $inc: { 'fareOptions.$[fare].seatsAvailable': booking.travellers.length },
        $pull: { 'seatMap.unavailableSeats': { $in: seats } },
      },
      { arrayFilters: [{ 'fare.type': booking.selection.fareType }] },
    );
  } else {
    await Hotel.updateOne(
      { _id: booking.itemId },
      { $inc: { 'roomTypes.$[room].roomsAvailable': booking.selection.rooms } },
      { arrayFilters: [{ 'room.name': booking.selection.roomTypeName }] },
    );
  }
}

// Full refund before the free-cancellation cutoff, otherwise total minus the stated fee (never negative).
export function computeRefund(booking, now = new Date()) {
  const total = booking.fareBreakdown.total;
  const { freeUntil, feeAfterCutoff = 0 } = booking.policySnapshot || {};
  if (freeUntil && now <= new Date(freeUntil)) return total;
  return Math.max(0, total - feeAfterCutoff);
}
