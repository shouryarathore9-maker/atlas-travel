import crypto from 'node:crypto';
import Flight from '../models/Flight.js';
import { MEALS } from '../seed/data.js';
import { DAY_MS, istMidnight, lastBookableDate, nightsBetween } from '../utils/dates.js';
import { HttpError } from '../utils/httpError.js';
import { AIRCRAFT, cabinSeats, seatLetters } from './aircraft.js';
import { releaseRooms, reserveRooms, roomAvailability, stayNights } from './inventory.js';
import { ENGINE_VERSION, FLIGHT_TAX_RATE, flightFare, hotelStay, INFANT_FEE } from './pricing.js';

export { FLIGHT_TAX_RATE, INFANT_FEE };

function assert(condition, message, code = 'INVALID_SELECTION') {
  if (!condition) throw new HttpError(400, message, code);
}

// ---------- Seats and meals ----------

// Which cabin a seat belongs to, and what kind of seat it is (for its fee).
export function seatInfo(config, label) {
  const match = /^(\d{1,2})([A-Z])$/.exec(label || '');
  if (!match) return null;
  const row = Number(match[1]);
  for (const [cabinName, cabin] of Object.entries(AIRCRAFT[config]?.cabins || {})) {
    if (!cabin.rows.includes(row)) continue;
    const layout = cabin.layout;
    const index = layout.indexOf(match[2]);
    if (index < 0) return null;
    const letters = seatLetters(cabin);
    let kind = 'middle';
    if (match[2] === letters[0] || match[2] === letters[letters.length - 1]) kind = 'window';
    else if (layout[index - 1] === '' || layout[index + 1] === '') kind = 'aisle';
    if (cabin.extraLegroomRows.includes(row)) kind = 'extraLegroom';
    return { cabin: cabinName, row, kind };
  }
  return null;
}

export function seatFee(supplier, config, label) {
  const info = seatInfo(config, label);
  if (!info || info.cabin === 'business') return 0; // business seats are included in the fare
  return supplier.rateCard?.seatFees?.[info.kind] ?? 0;
}

// Platform default menus (prd.md → Workflow 16): the Phase 1 menu for economy, a complimentary one for business.
export const DEFAULT_MEALS = {
  economy: MEALS,
  business: [
    { name: 'Chef’s vegetarian thali', price: 0, isVeg: true },
    { name: 'Grilled paneer with saffron rice', price: 0, isVeg: true },
    { name: 'Murgh makhani with jeera rice', price: 0, isVeg: false },
    { name: 'Continental breakfast platter', price: 0, isVeg: true },
  ],
};

export function mealsFor(supplier, cabin) {
  const own = supplier?.policies?.mealsByCabin?.[cabin];
  return own?.length ? own : DEFAULT_MEALS[cabin] || [];
}

// ---------- Passengers ----------

// "  ravi   KUMAR " and "Ravi Kumar" are the same person for the duplicate check.
export const normaliseName = (first, last) => `${first} ${last}`.trim().replace(/\s+/g, ' ').toLowerCase();

export function checkParty(travellers) {
  const adults = travellers.filter((t) => t.ageCategory === 'adult').length;
  const children = travellers.filter((t) => t.ageCategory === 'child').length;
  const infants = travellers.filter((t) => t.ageCategory === 'infant').length;
  assert(adults >= 1, 'Every booking needs at least one adult (12 or over).');
  assert(adults + children <= 9, 'A booking can have at most 9 adults and children.');
  assert(infants <= adults, 'Each infant needs an adult to travel with — add an adult or remove an infant.');
  const names = travellers.map((t) => normaliseName(t.firstName, t.lastName));
  assert(
    new Set(names).size === names.length,
    'Two travellers have the same name. Add a middle name or suffix (e.g. Jr.) to tell them apart.',
    'DUPLICATE_NAMES',
  );
  return { adults, children, infants, paying: adults + children };
}

// ---------- Pricing a booking ----------

const tierFor = (supplier, fareType) => (supplier.rateCard?.tiers || []).find((t) => t.name === fareType);

/** Prices a flight booking with the engine. Throws on anything that can't be booked. */
export function priceFlight(flight, supplier, { fareType, travellers }, { templates, now = Date.now(), limits }) {
  const tier = tierFor(supplier, fareType);
  assert(tier, 'That fare is no longer offered on this flight.');
  const cabin = flight.cabins?.[tier.cabin];
  assert(cabin, `This flight has no ${tier.cabin} cabin.`);
  assert(new Date(flight.departureTime) > new Date(now), 'This flight has already departed.');
  assert(flight.status !== 'cancelled', 'This flight was cancelled by the airline.', 'NOT_ON_SALE');
  assert(!flight.salesStopped, 'The airline has stopped sales on this flight.', 'NOT_ON_SALE');

  const party = checkParty(travellers);
  assert(cabin.capacity - cabin.sold >= party.paying, 'Not enough seats left on this fare.', 'SOLD_OUT');

  const seats = [];
  let seatCharges = 0;
  let mealCharges = 0;
  const menu = mealsFor(supplier, tier.cabin);
  const cabinSet = new Set(cabinSeats(flight.aircraftConfig, tier.cabin));
  for (const t of travellers) {
    if (t.ageCategory === 'infant') {
      assert(!t.seat && !t.meal, 'Infants sit on an adult’s lap, so they don’t get a seat or meal.');
      continue;
    }
    if (t.seat) {
      assert(cabinSet.has(t.seat), `Seat ${t.seat} isn’t in the ${tier.cabin} cabin of this aircraft.`);
      assert(!flight.seatMap.unavailableSeats.includes(t.seat), `Seat ${t.seat} is no longer available.`, 'SEAT_TAKEN');
      seats.push(t.seat);
      seatCharges += seatFee(supplier, flight.aircraftConfig, t.seat);
    }
    if (t.meal) {
      const option = menu.find((m) => m.name === t.meal);
      assert(option, `${t.meal} isn’t on the ${tier.cabin} menu.`);
      mealCharges += option.price;
    }
  }
  assert(new Set(seats).size === seats.length, 'Each traveller needs a different seat.');

  const fare = flightFare(supplier.rateCard, {
    origin: flight.origin.code,
    destination: flight.destination.code,
    cabin: tier.cabin,
    tier,
    departureTime: flight.departureTime,
    now,
    load: cabin.capacity ? cabin.sold / cabin.capacity : 0,
    limits,
  });
  const template = templates[tier.templateKey];
  assert(template, 'This fare’s cancellation terms are missing.', 'MISCONFIGURED');
  return {
    kind: 'flight',
    tier,
    cabin: tier.cabin,
    party,
    seats,
    eligible: fare.price * party.paying, // what an offer can discount: the base fare
    parts: { base: fare.price * party.paying, infantFees: INFANT_FEE * party.infants, seatCharges, mealCharges, breakfast: 0 },
    taxes: (discount) => Math.round((fare.price * party.paying - discount) * FLIGHT_TAX_RATE),
    template,
    policyStart: flight.departureTime,
    oneNight: 0,
    pricing: { engineVersion: ENGINE_VERSION, perTraveller: fare.price, cabinBase: fare.cabinBase, factors: fare.factors },
  };
}

// Whether `rooms` of a room type hold the party (capacity only; availability is per night).
export function roomFits(roomType, { adults, children, rooms }) {
  return roomType.occupancy.adults * rooms >= adults && (roomType.occupancy.adults + roomType.occupancy.children) * rooms >= adults + children;
}

// `inventory` is the hotel's { [roomTypeName]: RoomInventory } (services/inventory.js).
export function priceHotel(hotel, supplier, input, { templates, now = Date.now(), limits, inventory = {} }) {
  const { roomTypeName, ratePlan: planKey = 'flexible', breakfast = false, rooms, checkIn, checkOut, adults, children } = input;
  const room = hotel.roomTypes.find((r) => r.name === roomTypeName);
  assert(room, 'That room type is no longer offered at this hotel.');
  const nights = nightsBetween(checkIn, checkOut);
  assert(nights >= 1, 'Check-out must be after check-in.');
  assert(nights <= 30, 'Stays are limited to 30 nights.');
  assert(istMidnight(checkIn).getTime() + DAY_MS > now, 'Check-in date is in the past.');
  assert(checkIn <= lastBookableDate(now), 'Stays can be booked up to 60 days ahead.');
  const availability = roomAvailability(room, inventory[roomTypeName], stayNights(checkIn, checkOut));
  assert(!hotel.salesStopped && !availability.stopped, 'This hotel isn’t taking bookings for that room on these dates.', 'NOT_ON_SALE');
  assert(availability.free >= rooms, availability.free ? `Only ${availability.free} room(s) of this type are free on all your nights.` : 'This room type is fully booked on your dates.', 'SOLD_OUT');
  assert(roomFits(room, { adults, children, rooms }), 'These rooms cannot hold your whole party. Add rooms or pick a larger room type.');

  const plan = (supplier.rateCard?.ratePlans || []).find((p) => p.key === planKey);
  assert(plan, 'That rate plan isn’t offered.');
  const stay = hotelStay(supplier.rateCard, { roomTypeName, checkIn, checkOut, now, ratePlan: plan, occupancy: availability.occupancy, limits });
  assert(stay, 'This room has no rate set. Please choose another room.', 'MISCONFIGURED');
  const template = templates[plan.templateKey];
  assert(template, 'This rate plan’s cancellation terms are missing.', 'MISCONFIGURED');

  const roomCharges = stay.perRoom * rooms;
  const breakfastCharge = breakfast && !room.breakfastIncluded ? (supplier.rateCard.breakfastPerGuest || 0) * (adults + children) * nights : 0;
  return {
    kind: 'hotel',
    room,
    plan,
    nights,
    breakfastAdded: breakfastCharge > 0,
    eligible: roomCharges, // what an offer can discount: the room charges
    parts: { base: roomCharges, infantFees: 0, seatCharges: 0, mealCharges: 0, breakfast: breakfastCharge },
    taxes: () => room.taxesAndFees * rooms * nights, // fixed per room per night; a discount doesn't shrink it
    template,
    policyStart: istMidnight(checkIn),
    oneNight: stay.nights[0].price,
    pricing: { engineVersion: ENGINE_VERSION, nights: stay.nights, avgNightly: stay.avgNightly, ratePlan: plan.key },
  };
}

// The final price lines, given an offer's discount (whole rupees, never more than the eligible amount).
export function finalize(priced, discount = 0) {
  const d = Math.max(0, Math.min(Math.floor(discount), priced.eligible));
  const { base, infantFees, seatCharges, mealCharges, breakfast } = priced.parts;
  const taxes = priced.taxes(d);
  const addons = seatCharges + mealCharges + breakfast;
  return { base, infantFees, seatCharges, mealCharges, breakfast, addons, discounts: d, taxes, total: base - d + infantFees + addons + taxes };
}

// ---------- References ----------

const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = (length) => Array.from(crypto.randomBytes(length), (b) => REFERENCE_ALPHABET[b % REFERENCE_ALPHABET.length]).join('');

export const generateReference = () => `AT${randomCode(6)}`;
export const generatePnr = () => randomCode(6);
export const generateTransactionId = () => 'MOCKTXN' + crypto.randomBytes(6).toString('hex').toUpperCase();

// Simulated, deterministic 13-digit e-ticket numbers: the airline's ticketing prefix + 10 digits.
const TICKET_PREFIX = { '6E': '312', AI: '098', UK: '228', SG: '775' };
export function ticketNumber(airlineCode, bookingId, index) {
  const digest = crypto.createHash('sha256').update(`${bookingId}:${index}`).digest();
  const digits = String(digest.readUIntBE(0, 6) % 10_000_000_000).padStart(10, '0');
  return `${TICKET_PREFIX[airlineCode] || '999'}${digits}`;
}

// ---------- Inventory ----------

const seatsOf = (booking) => booking.travellers.map((t) => t.seat).filter(Boolean);
const payingCount = (booking) => booking.travellers.filter((t) => t.ageCategory !== 'infant').length;

// Atomic, conditional update so two people can never book the same seat, the last seat or the last room
// (hotels: every night of the stay at once — services/inventory.js).
export async function reserveInventory(booking) {
  if (booking.type === 'flight') {
    const cabin = booking.selection.cabin;
    const n = payingCount(booking);
    const result = await Flight.updateOne(
      {
        _id: booking.itemId,
        status: 'scheduled',
        salesStopped: { $ne: true },
        'seatMap.unavailableSeats': { $nin: seatsOf(booking) },
        $expr: { $lte: [{ $add: [`$cabins.${cabin}.sold`, n] }, `$cabins.${cabin}.capacity`] },
      },
      { $inc: { [`cabins.${cabin}.sold`]: n }, $push: { 'seatMap.unavailableSeats': { $each: seatsOf(booking) } } },
    );
    if (!result.modifiedCount) throw new HttpError(409, 'Someone just booked one of those seats. Please choose again.', 'INVENTORY_CHANGED');
  } else {
    await reserveRooms(booking);
  }
}

export async function releaseInventory(booking) {
  if (booking.type === 'flight') {
    const cabin = booking.selection.cabin || 'economy';
    await Flight.updateOne(
      { _id: booking.itemId },
      { $inc: { [`cabins.${cabin}.sold`]: -payingCount(booking) }, $pull: { 'seatMap.unavailableSeats': { $in: seatsOf(booking) } } },
    );
  } else {
    await releaseRooms(booking);
  }
}

// Full refund before the frozen free-cancellation cutoff, otherwise the amount paid minus the
// frozen fee (never negative). Non-refundable bookings froze the whole amount as the fee.
export function computeRefund(booking, now = new Date()) {
  const total = booking.fareBreakdown.total;
  const { freeUntil, feeAfterCutoff = 0 } = booking.policySnapshot || {};
  if (freeUntil && now <= new Date(freeUntil)) return total;
  return Math.max(0, total - feeAfterCutoff);
}
