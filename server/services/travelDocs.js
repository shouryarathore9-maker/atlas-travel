// E-tickets, vouchers, web check-in and boarding passes (prd.md → Workflows 22–23).
// Terminals, gates and boarding sequence are simulated but deterministic. QR codes carry only a
// signed reference — never names or other personal details — and are drawn in the browser.
import crypto from 'node:crypto';
import Booking from '../models/Booking.js';
import Flight from '../models/Flight.js';
import { HttpError } from '../utils/httpError.js';
import { cabinSeats } from './aircraft.js';

export const CHECK_IN_OPENS_MS = 48 * 3600e3;
export const CHECK_IN_CLOSES_MS = 60 * 60e3;
export const BOARDING_BEFORE_MS = 45 * 60e3;

// Which terminal an airline uses at each airport (simplified from real allocations).
const TERMINALS = {
  DEL: { IndiGo: 'T1', SpiceJet: 'T1', 'Air India': 'T3', Vistara: 'T3' },
  BOM: { IndiGo: 'T2', SpiceJet: 'T1', 'Air India': 'T2', Vistara: 'T2' },
  BLR: { IndiGo: 'T1', SpiceJet: 'T1', 'Air India': 'T2', Vistara: 'T2' },
  MAA: { default: 'T1' },
  HYD: { default: 'T1' },
  CCU: { default: 'T1' },
  PNQ: { default: 'T1' },
  AMD: { IndiGo: 'T1', SpiceJet: 'T1', 'Air India': 'T2', Vistara: 'T2' },
};
export const terminalFor = (airport, airline) => TERMINALS[airport]?.[airline] || TERMINALS[airport]?.default || 'T1';

const hashInt = (text) => crypto.createHash('sha256').update(text).digest().readUInt32BE(0);
export const gateFor = (flight) => `${'ABCD'[hashInt(`${flight._id}g`) % 4]}${(hashInt(String(flight._id)) % 28) + 1}`;

const qrKey = () => crypto.createHmac('sha256', process.env.JWT_SECRET || 'atlas').update('atlas-qr-v1').digest();
export function signedQr(reference, travellerIndex = 0) {
  const body = `ATLAS1.${reference}.${travellerIndex}`;
  const sig = crypto.createHmac('sha256', qrKey()).update(body).digest('base64url').slice(0, 16);
  return `${body}.${sig}`;
}
export function verifyQr(payload) {
  const [prefix, ref, index, sig] = String(payload).split('.');
  if (prefix !== 'ATLAS1' || !sig) return false;
  const expected = signedQr(ref, Number(index)).split('.').pop();
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

export function checkInWindow(departureTime, now = Date.now()) {
  const dep = new Date(departureTime).getTime();
  return { opensAt: new Date(dep - CHECK_IN_OPENS_MS), closesAt: new Date(dep - CHECK_IN_CLOSES_MS), open: now >= dep - CHECK_IN_OPENS_MS && now < dep - CHECK_IN_CLOSES_MS };
}

export async function documentsFor(booking) {
  const base = { booking, qr: booking.type === 'flight' ? signedQr(booking.bookingReference) : null };
  if (booking.type !== 'flight') return base;
  const flight = await Flight.findById(booking.itemId, { seatMap: 0 }).lean();
  if (!flight) return base;
  return {
    ...base,
    flight: {
      airline: flight.airline,
      flightNumber: flight.flightNumber,
      aircraftType: flight.aircraftType,
      origin: { ...flight.origin, terminal: terminalFor(flight.origin.code, flight.airline) },
      destination: { ...flight.destination, terminal: terminalFor(flight.destination.code, flight.airline) },
      departureTime: flight.departureTime,
      arrivalTime: flight.arrivalTime,
      durationMinutes: flight.durationMinutes,
      status: flight.status,
    },
    checkIn: checkInWindow(flight.departureTime),
    passes: booking.checkIn ? booking.checkIn.passes.map((p) => ({ ...p, qr: signedQr(booking.bookingReference, p.travellerIndex) })) : [],
  };
}

/** Web check-in: assigns seats to travellers without one and issues boarding passes. */
export async function checkIn(booking, { now = Date.now() } = {}) {
  if (booking.type !== 'flight') throw new HttpError(400, 'Only flights have check-in.', 'NOT_ALLOWED');
  if (booking.status !== 'confirmed') throw new HttpError(409, 'This booking is cancelled.', 'NOT_ALLOWED');
  if (booking.checkIn) return booking; // checking in again shows the same passes and never moves seats
  if (booking.travellers.some((t) => t.ageCategory === 'infant')) {
    throw new HttpError(409, 'Travellers with an infant check in at the airport counter.', 'INFANT_AIRPORT_CHECKIN');
  }
  const flight = await Flight.findById(booking.itemId).lean();
  if (!flight || flight.status === 'cancelled') throw new HttpError(409, 'This flight was cancelled.', 'NOT_ALLOWED');
  const window = checkInWindow(flight.departureTime, now);
  if (!window.open) {
    throw new HttpError(409, now < window.opensAt ? 'Check-in isn’t open yet.' : 'Check-in has closed — please check in at the airport.', 'CHECKIN_CLOSED');
  }

  // Seats for travellers who didn't choose one: free seats in the booked cabin, claimed atomically.
  const cabin = booking.selection.cabin || 'economy';
  const need = booking.travellers.map((t, i) => (!t.seat ? i : null)).filter((i) => i !== null);
  let assigned = {};
  for (let attempt = 0; attempt < 4 && need.length; attempt++) {
    const fresh = await Flight.findById(flight._id, { seatMap: 1 }).lean();
    const taken = new Set(fresh.seatMap.unavailableSeats);
    const free = cabinSeats(flight.aircraftConfig, cabin).filter((s) => !taken.has(s));
    if (free.length < need.length) throw new HttpError(409, 'No free seats left to assign — please see the airport counter.', 'NO_SEATS');
    const pick = free.slice(Math.max(0, Math.floor(free.length / 2) - 1), Math.max(0, Math.floor(free.length / 2) - 1) + need.length);
    const seats = pick.length === need.length ? pick : free.slice(0, need.length);
    const result = await Flight.updateOne({ _id: flight._id, 'seatMap.unavailableSeats': { $nin: seats } }, { $push: { 'seatMap.unavailableSeats': { $each: seats } } });
    if (result.modifiedCount) {
      assigned = Object.fromEntries(need.map((i, k) => [i, seats[k]]));
      break;
    }
  }
  if (need.length && !Object.keys(assigned).length) throw new HttpError(409, 'Seats changed while we were assigning them. Please try again.', 'INVENTORY_CHANGED');

  const counter = await Flight.findOneAndUpdate({ _id: flight._id }, { $inc: { checkInSeq: booking.travellers.length } }, { returnDocument: 'after' }).lean();
  const firstSeq = counter.checkInSeq - booking.travellers.length + 1;
  const gate = gateFor(flight);
  const boardingTime = new Date(new Date(flight.departureTime).getTime() - BOARDING_BEFORE_MS);
  const travellers = booking.travellers.map((t, i) => ({ ...t, seat: t.seat || assigned[i] }));
  const passes = travellers.map((t, i) => ({ travellerIndex: i, seat: t.seat, gate, boardingTime, sequence: firstSeq + i }));
  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, checkIn: null },
    { $set: { travellers, checkIn: { at: new Date(now), passes } } },
    { returnDocument: 'after' },
  ).lean();
  return updated || Booking.findById(booking._id).lean();
}
