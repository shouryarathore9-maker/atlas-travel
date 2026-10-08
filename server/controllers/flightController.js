import { z } from 'zod';
import Flight from '../models/Flight.js';
import Review from '../models/Review.js';
import { istDayRange, IST_OFFSET_MS, lastBookableDate } from '../utils/dates.js';
import { HttpError } from '../utils/httpError.js';
import { csv, dateString, optionalNumber, paginate, pagination } from '../utils/query.js';

export const DEPARTURE_WINDOWS = {
  early: [0, 6],
  morning: [6, 12],
  afternoon: [12, 18],
  evening: [18, 24],
};

export const flightSearchSchema = z.object({
  origin: z.string().trim().toUpperCase().length(3, 'Choose where you are flying from'),
  destination: z.string().trim().toUpperCase().length(3, 'Choose where you are flying to'),
  date: dateString,
  travellers: z.coerce.number().int().min(1).max(9).default(1),
  cabin: z.enum(['economy', 'business']).default('economy'),
  stops: csv,
  airlines: csv,
  departure: csv,
  maxPrice: optionalNumber,
  sort: z.enum(['price', 'duration', 'departure', 'rating']).default('price'),
  ...pagination,
});

export function faresForCabin(fareOptions, cabin) {
  return fareOptions.filter((fare) => (cabin === 'business' ? fare.type === 'Business' : fare.type !== 'Business'));
}

function istHour(date) {
  return new Date(date.getTime() + IST_OFFSET_MS).getUTCHours();
}

const sorters = {
  price: (a, b) => a.price - b.price,
  duration: (a, b) => a.durationMinutes - b.durationMinutes || a.price - b.price,
  departure: (a, b) => a.departureTime - b.departureTime,
  rating: (a, b) => b.rating.average - a.rating.average || a.price - b.price,
};

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
    .select('-seatMap.unavailableSeats -mealOptions')
    .lean();

  // Flights that have at least one fare in the chosen cabin with enough seats
  const available = candidates
    .map((flight) => {
      const fares = faresForCabin(flight.fareOptions, q.cabin).filter((f) => f.seatsAvailable >= q.travellers);
      if (!fares.length) return null;
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
        price: Math.min(...fares.map((f) => f.price)),
        fareTypes: fares.map((f) => f.type),
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

export async function getFlight(req, res) {
  const flight = await Flight.findById(req.params.id).lean();
  if (!flight) throw new HttpError(404, 'We could not find that flight.', 'NOT_FOUND');
  const reviews = await Review.find(reviewTarget(flight)).sort({ createdAt: -1 }).limit(5).lean();
  res.json({ flight, reviews });
}
