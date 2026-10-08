import mongoose from 'mongoose';
import { z } from 'zod';
import Flight from '../models/Flight.js';
import Review from '../models/Review.js';
import Supplier from '../models/Supplier.js';
import { AIRCRAFT, hasCabin } from '../services/aircraft.js';
import { mealsFor, seatInfo } from '../services/bookingService.js';
import { FLIGHT_TAX_RATE, flightFare, INFANT_FEE, tiersForCabin } from '../services/pricing.js';
import { describeTemplate, loadTemplates } from '../services/templates.js';
import { istDayRange, IST_OFFSET_MS, lastBookableDate } from '../utils/dates.js';
import { HttpError } from '../utils/httpError.js';
import { csv, dateString, optionalNumber, paginate, pagination } from '../utils/query.js';

export const DEPARTURE_WINDOWS = {
  early: [0, 6],
  morning: [6, 12],
  afternoon: [12, 18],
  evening: [18, 24],
};

// The party: adults, children (2–11) and infants (under 2). `travellers` is the Phase 1 name for adults.
const party = {
  adults: z.coerce.number().int().min(1).max(9).optional(),
  travellers: z.coerce.number().int().min(1).max(9).optional(),
  children: z.coerce.number().int().min(0).max(8).default(0),
  infants: z.coerce.number().int().min(0).max(9).default(0),
  cabin: z.enum(['economy', 'business']).default('economy'),
};
const withParty = (schema) =>
  schema
    .transform(({ travellers, ...q }) => ({ ...q, adults: q.adults ?? travellers ?? 1 }))
    .refine((q) => q.adults + q.children <= 9, { message: 'A booking can have at most 9 adults and children', path: ['children'] })
    .refine((q) => q.infants <= q.adults, { message: 'Each infant needs an adult to travel with', path: ['infants'] });

export const flightSearchSchema = withParty(
  z.object({
    origin: z.string().trim().toUpperCase().length(3, 'Choose where you are flying from'),
    destination: z.string().trim().toUpperCase().length(3, 'Choose where you are flying to'),
    date: dateString,
    ...party,
    stops: csv,
    airlines: csv,
    departure: csv,
    maxPrice: optionalNumber,
    sort: z.enum(['price', 'duration', 'departure', 'rating']).default('price'),
    ...pagination,
  }),
);

export const flightDetailSchema = withParty(z.object(party));

function istHour(date) {
  return new Date(date.getTime() + IST_OFFSET_MS).getUTCHours();
}

const sorters = {
  price: (a, b) => a.price - b.price,
  duration: (a, b) => a.durationMinutes - b.durationMinutes || a.price - b.price,
  departure: (a, b) => a.departureTime - b.departureTime,
  rating: (a, b) => b.rating.average - a.rating.average || a.price - b.price,
};

async function suppliersFor(items) {
  const ids = [...new Set(items.map((i) => String(i.supplierId)).filter((id) => id !== 'null'))];
  const suppliers = await Supplier.find({ _id: { $in: ids } }).lean();
  return Object.fromEntries(suppliers.map((s) => [String(s._id), s]));
}

const loadOf = (cabin) => (cabin.capacity ? cabin.sold / cabin.capacity : 0);

// Lowest engine price for the cabin on a departure, or null if it can't seat the party.
function lowestFare(flight, supplier, cabinName, seatsNeeded, now) {
  const cabin = flight.cabins?.[cabinName];
  if (!supplier?.rateCard?.kind || !cabin || cabin.capacity - cabin.sold < seatsNeeded) return null;
  const prices = tiersForCabin(supplier.rateCard, cabinName).map((tier) => ({
    tier: tier.name,
    price: flightFare(supplier.rateCard, {
      origin: flight.origin.code,
      destination: flight.destination.code,
      cabin: cabinName,
      tier,
      departureTime: flight.departureTime,
      now,
      load: loadOf(cabin),
    }).price,
  }));
  return prices.length ? prices.reduce((min, p) => (p.price < min.price ? p : min)) : null;
}

export async function searchFlights(req, res) {
  const q = req.validated.query;
  const [start, end] = istDayRange(q.date);
  // Beyond the booking horizon there are no departures yet; say so instead of "no flights".
  if (q.date > lastBookableDate()) {
    return res.json({ results: [], total: 0, page: 1, pages: 1, unfilteredTotal: 0, tooFar: true, facets: { airlines: [], stops: [], minPrice: 0, maxPrice: 0 } });
  }

  // Cancelled departures and those with sales stopped by the airline aren't on sale.
  const candidates = await Flight.find({
    'origin.code': q.origin,
    'destination.code': q.destination,
    departureTime: { $gte: start, $lt: end },
    status: 'scheduled',
    salesStopped: { $ne: true },
  })
    .select('-seatMap')
    .lean();
  const suppliers = await suppliersFor(candidates);
  const now = Date.now();
  const seatsNeeded = q.adults + q.children;

  const available = candidates
    .map((flight) => {
      if (flight.departureTime <= new Date(now)) return null;
      const fare = lowestFare(flight, suppliers[String(flight.supplierId)], q.cabin, seatsNeeded, now);
      if (!fare) return null;
      return {
        _id: flight._id,
        airline: flight.airline,
        flightNumber: flight.flightNumber,
        aircraftType: flight.aircraftType,
        origin: flight.origin,
        destination: flight.destination,
        departureTime: flight.departureTime,
        arrivalTime: flight.arrivalTime,
        durationMinutes: flight.durationMinutes,
        stops: flight.stops,
        rating: flight.rating,
        price: fare.price,
      };
    })
    .filter(Boolean);

  const prices = available.map((f) => f.price);
  const facets = {
    airlines: [...new Set(available.map((f) => f.airline))].sort(),
    stops: [...new Set(available.map((f) => f.stops))].sort(),
    minPrice: prices.length ? Math.min(...prices) : 0,
    maxPrice: prices.length ? Math.max(...prices) : 0,
  };

  const filtered = available.filter((f) => {
    if (q.stops.length && !q.stops.includes(String(Math.min(f.stops, 1)))) return false;
    if (q.airlines.length && !q.airlines.includes(f.airline)) return false;
    if (q.maxPrice !== undefined && f.price > q.maxPrice) return false;
    if (q.departure.length) {
      const hour = istHour(new Date(f.departureTime));
      const inWindow = q.departure.some((key) => {
        const window = DEPARTURE_WINDOWS[key];
        return window && hour >= window[0] && hour < window[1];
      });
      if (!inWindow) return false;
    }
    return true;
  });

  filtered.sort(sorters[q.sort]);
  res.json({ ...paginate(filtered, q.page, q.limit), facets, unfilteredTotal: available.length });
}

// Reviews belong to the service (flight number), so every departure of it shows the same ones.
export function reviewTarget(flight) {
  return flight.serviceId ? { itemType: 'service', itemId: flight.serviceId } : { itemType: 'flight', itemId: flight._id };
}

// Everything the flight page needs for one cabin: priced tiers, the cabin's seat layout and fees,
// the cabin's menu, and the supplier-cancellation promise.
export async function getFlight(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'We could not find that flight.', 'NOT_FOUND');
  const q = req.validated.query;
  const flight = await Flight.findById(req.params.id).lean();
  if (!flight) throw new HttpError(404, 'We could not find that flight.', 'NOT_FOUND');
  const [supplier, templates, reviews] = await Promise.all([
    flight.supplierId ? Supplier.findById(flight.supplierId).lean() : null,
    loadTemplates(),
    Review.find(reviewTarget(flight)).sort({ createdAt: -1 }).limit(5).lean(),
  ]);
  const now = Date.now();
  const cabinName = hasCabin(flight.aircraftConfig, q.cabin) ? q.cabin : null;
  const cabin = cabinName ? flight.cabins[cabinName] : null;
  const seatsLeft = cabin ? cabin.capacity - cabin.sold : 0;
  const card = supplier?.rateCard?.kind ? supplier.rateCard : null;

  const tiers = card && cabin
    ? tiersForCabin(card, cabinName).map((tier) => ({
        name: tier.name,
        price: flightFare(card, { origin: flight.origin.code, destination: flight.destination.code, cabin: cabinName, tier, departureTime: flight.departureTime, now, load: loadOf(cabin) }).price,
        cabinBaggageKg: tier.cabinBaggageKg,
        checkinBaggageKg: tier.checkinBaggageKg,
        dateChangeFee: tier.dateChangeFee,
        terms: describeTemplate(templates[tier.templateKey]),
        available: seatsLeft >= q.adults + q.children,
      }))
    : [];

  const layout = cabinName ? AIRCRAFT[flight.aircraftConfig].cabins[cabinName] : null;
  const unavailable = layout ? flight.seatMap.unavailableSeats.filter((s) => seatInfo(flight.aircraftConfig, s)?.cabin === cabinName) : [];

  res.json({
    flight: {
      _id: flight._id,
      airline: flight.airline,
      airlineCode: supplier?.code || null,
      flightNumber: flight.flightNumber,
      aircraftType: flight.aircraftType,
      aircraftConfig: flight.aircraftConfig,
      origin: flight.origin,
      destination: flight.destination,
      departureTime: flight.departureTime,
      arrivalTime: flight.arrivalTime,
      durationMinutes: flight.durationMinutes,
      stops: flight.stops,
      rating: flight.rating,
      status: flight.status,
      salesStopped: flight.salesStopped,
      scheduleChange: flight.scheduleChange,
      cabins: Object.fromEntries(Object.keys(AIRCRAFT[flight.aircraftConfig].cabins).map((c) => [c, true])),
    },
    cabin: cabinName,
    tiers,
    seatMap: layout && {
      rows: layout.rows,
      layout: layout.layout,
      extraLegroomRows: layout.extraLegroomRows,
      unavailableSeats: unavailable,
      blockedSeats: flight.seatMap.blockedSeats.filter((s) => unavailable.includes(s)),
      fees: cabinName === 'business' ? { window: 0, aisle: 0, middle: 0, extraLegroom: 0 } : { ...card?.seatFees },
    },
    meals: cabinName ? mealsFor(supplier, cabinName) : [],
    infantFee: INFANT_FEE,
    taxRate: FLIGHT_TAX_RATE,
    reviews,
  });
}
