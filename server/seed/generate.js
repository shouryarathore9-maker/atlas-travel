import mongoose from 'mongoose';
import { AIRCRAFT, seatLetters } from '../services/aircraft.js';
import { BREAKFAST_BY_STARS, defaultAirlineRateCard, defaultHotelRateCard } from '../services/pricing.js';
import { addDays, istMidnight, todayIstString } from '../utils/dates.js';
import {
  AIRLINES,
  CITIES,
  FLIGHT_REVIEWS,
  HOTEL_AMENITIES,
  HOTEL_PHOTO_COUNT,
  HOTEL_REVIEWS,
  HOTELS_BY_CITY,
  REVIEWER_NAMES,
  ROOM_AMENITIES,
  ROOM_TYPES,
  ROUTE_PAIRS,
} from './data.js';

// Small deterministic PRNG so every seed run produces the same schedule and prices.
export function createRng(seed = 42) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min, max) => min + Math.floor(next() * (max - min + 1));
  const pick = (arr) => arr[Math.floor(next() * arr.length)];
  const sample = (arr, n) => [...arr].sort(() => next() - 0.5).slice(0, n);
  return { next, int, pick, sample };
}

// FNV-1a string hash → PRNG seed, so a departure's details depend only on (service, date).
function hashSeed(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const round = (n, step) => Math.round(n / step) * step;

export function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export const slugify = (text) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');

const DEPARTURE_SLOTS = [6 * 60 + 5, 9 * 60 + 40, 14 * 60 + 15, 19 * 60 + 50];

export function generateAirlineSuppliers() {
  return AIRLINES.map((airline) => ({
    _id: new mongoose.Types.ObjectId(),
    kind: 'airline',
    name: airline.name,
    code: airline.code,
    slug: airline.slug,
    rateCard: defaultAirlineRateCard(airline.name),
    policies: { mealsByCabin: { economy: null, business: null }, blockedSeats: {} },
  }));
}

// The Phase 1 timetable as recurring services: 36 routes × 4 daily slots, each with its own airline.
export function generateServices({ airlineSuppliers, startDate = todayIstString(), rng = createRng(7) } = {}) {
  const byCode = Object.fromEntries(CITIES.map((c) => [c.code, c]));
  const supplierByName = Object.fromEntries(airlineSuppliers.map((s) => [s.name, s]));
  const routes = ROUTE_PAIRS.flatMap(([a, b]) => [[a, b], [b, a]]);
  const usedNumbers = new Set();
  const services = [];

  routes.forEach(([from, to], routeIndex) => {
    const origin = byCode[from];
    const destination = byCode[to];
    const km = distanceKm(origin, destination);
    const baseDuration = round(45 + km / 12, 5);

    DEPARTURE_SLOTS.forEach((slot, i) => {
      const airline = AIRLINES[(routeIndex + i) % AIRLINES.length];
      const stops = i === 3 && rng.next() < 0.5 ? 1 : 0;
      const shortHaul = airline.shortHaulConfig && km < AIRCRAFT[airline.shortHaulConfig].maxRouteKm && stops === 0;
      let flightNumber;
      do flightNumber = `${airline.code} ${rng.int(101, 989)}`;
      while (usedNumbers.has(flightNumber));
      usedNumbers.add(flightNumber);
      services.push({
        _id: new mongoose.Types.ObjectId(),
        supplierId: supplierByName[airline.name]._id,
        airline: airline.name,
        flightNumber,
        origin: { code: origin.code, city: origin.city, airport: origin.airport },
        destination: { code: destination.code, city: destination.city, airport: destination.airport },
        aircraftConfig: shortHaul ? airline.shortHaulConfig : airline.aircraftConfig,
        departureMinute: slot + rng.int(-20, 20),
        durationMinutes: baseDuration + (stops ? 95 : 0) + (shortHaul ? 15 : 0),
        stops,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startDate,
        endDate: null,
        status: 'active',
        rating: { average: 0, count: 0 },
      });
    });
  });
  return services;
}

// Is `dateStr` a day this service operates?
export function operatesOn(service, dateStr) {
  if (service.status !== 'active') return false;
  if (dateStr < service.startDate) return false;
  if (service.endDate && dateStr > service.endDate) return false;
  const weekday = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return service.daysOfWeek.includes(weekday);
}

// One dated departure of a service. Deterministic per (service, date). Prices aren't stored: the
// engine prices it from the airline's rate card. Some seats start out taken (other passengers) so
// the demand factor and the seat map look realistic; `blocked` seats come from the airline's policy.
export function departureFor(service, dateStr, { now = Date.now(), blocked = [] } = {}) {
  const departure = new Date(istMidnight(dateStr).getTime() + service.departureMinute * 60000);
  if (departure.getTime() < now + 2 * 3600 * 1000) return null;
  const rng = createRng(hashSeed(`${service._id}|${dateStr}`));
  const config = AIRCRAFT[service.aircraftConfig];
  const blockedSet = new Set(blocked);
  const taken = new Set();
  const cabins = {};
  for (const [name, cabin] of Object.entries(config.cabins)) {
    const seats = cabin.rows.flatMap((row) => seatLetters(cabin).map((l) => `${row}${l}`)).filter((seat) => !blockedSet.has(seat));
    // Earlier departures are fuller; business sells less.
    const daysAhead = Math.round((istMidnight(dateStr) - istMidnight(todayIstString(now))) / 86400000);
    const share = name === 'business' ? rng.next() * 0.5 : Math.min(0.8, 0.1 + rng.next() * 0.35 + (daysAhead < 10 ? 0.25 : 0));
    const sold = Math.floor(seats.length * share);
    const pool = rng.sample(seats, sold);
    pool.forEach((seat) => taken.add(seat));
    cabins[name] = { capacity: seats.length, sold };
  }
  return {
    _id: new mongoose.Types.ObjectId(),
    supplierId: service.supplierId,
    serviceId: service._id,
    date: dateStr,
    aircraftConfig: service.aircraftConfig,
    airline: service.airline,
    flightNumber: service.flightNumber,
    aircraftType: config.name,
    origin: service.origin,
    destination: service.destination,
    departureTime: departure,
    arrivalTime: new Date(departure.getTime() + service.durationMinutes * 60000),
    durationMinutes: service.durationMinutes,
    stops: service.stops,
    status: 'scheduled',
    salesStopped: false,
    cabins: { economy: cabins.economy, business: cabins.business || null },
    seatMap: { unavailableSeats: [...taken, ...blockedSet], blockedSeats: [...blockedSet] },
    rating: service.rating || { average: 0, count: 0 },
  };
}

// Every departure of these services in the window [today, today + days).
export function generateDepartures(services, { days = 60, now = Date.now(), blockedFor = () => [] } = {}) {
  const today = todayIstString(now);
  const flights = [];
  for (let day = 0; day < days; day++) {
    const dateStr = addDays(today, day);
    for (const service of services) {
      if (!operatesOn(service, dateStr)) continue;
      const flight = departureFor(service, dateStr, { now, blocked: blockedFor(service) });
      if (flight) flights.push(flight);
    }
  }
  return flights;
}

const STAR_PATTERN = [5, 4, 4, 3, 5, 3];
const PRICE_BANDS = { 3: [2800, 4500], 4: [5500, 9000], 5: [11000, 22000] };

export function generateHotels({ rng = createRng(11) } = {}) {
  const hotels = [];
  let photoCursor = 0;
  for (const [city, entries] of Object.entries(HOTELS_BY_CITY)) {
    entries.forEach(([name, address], i) => {
      const stars = STAR_PATTERN[i];
      const [lo, hi] = PRICE_BANDS[stars];
      const nightly = round(lo + rng.next() * (hi - lo), 100);
      const essentials = ['Free Wi-Fi', 'Air conditioning', 'Restaurant'];
      const extras = rng.sample(
        HOTEL_AMENITIES.filter((a) => !essentials.includes(a)),
        stars === 5 ? 7 : stars === 4 ? 5 : 2,
      );
      if (stars === 5 && !extras.includes('Spa')) extras.push('Spa');
      const roomTypes = ROOM_TYPES.slice(0, stars === 3 ? 2 : 3).map((room) => {
        const price = round(nightly * room.factor, 100);
        const freeDays = stars === 3 ? rng.int(0, 1) : rng.int(1, 3);
        const rooms = rng.int(3, 10);
        return {
          name: room.name,
          occupancy: room.occupancy,
          bedType: room.bedType,
          amenities: rng.sample(ROOM_AMENITIES, rng.int(3, 6)),
          breakfastIncluded: rng.next() < (stars === 3 ? 0.3 : 0.6),
          taxesAndFees: round(price * (price > 7500 ? 0.18 : 0.12), 10),
          roomsTotal: rooms,
          // Seed-only: becomes the rate card's base rate and the flexible plan's template.
          seedBaseRate: price,
          seedFreeDays: freeDays,
        };
      });
      const photos = [0, 1, 2].map((k) => `/images/seed/hotels/hotel-${((photoCursor + k) % HOTEL_PHOTO_COUNT) + 1}.jpg`);
      photoCursor += 1;

      hotels.push({
        _id: new mongoose.Types.ObjectId(),
        name,
        city,
        address,
        description: `${name} is a ${stars}-star stay in ${address.split(',')[0]}, with ${extras
          .slice(0, 2)
          .map((a) => a.toLowerCase())
          .join(' and ')} — a quiet base for exploring ${city}.`,
        starRating: stars,
        amenities: [...essentials, ...extras],
        photos,
        roomTypes,
        rating: { average: 0, count: 0 },
      });
    });
  }
  return hotels;
}

const FLEX_TEMPLATE_BY_DAYS = { 0: 'H-STRICT', 1: 'H-FREE1', 2: 'H-FREE2', 3: 'H-FREE3' };

// One supplier per hotel, with a rate card built from the Phase 1 seed prices. Strips the seed-only
// fields from the hotel's room types (prices live in the rate card, terms in templates).
export function generateHotelSuppliers(hotels) {
  return hotels.map((hotel) => {
    const baseRates = Object.fromEntries(hotel.roomTypes.map((r) => [r.name, r.seedBaseRate]));
    const flexibleTemplate = FLEX_TEMPLATE_BY_DAYS[hotel.roomTypes[0].seedFreeDays] || 'H-FREE1';
    hotel.roomTypes = hotel.roomTypes.map(({ seedBaseRate: _rate, seedFreeDays: _days, ...room }) => room);
    return {
      _id: new mongoose.Types.ObjectId(),
      kind: 'hotel',
      name: hotel.name,
      hotelId: hotel._id,
      slug: slugify(hotel.name),
      rateCard: { ...defaultHotelRateCard({ baseRates, starRating: hotel.starRating, flexibleTemplate }), breakfastPerGuest: BREAKFAST_BY_STARS[hotel.starRating] },
      policies: {},
    };
  });
}

function reviewsFor(itemType, item, count, ratingPool, comments, rng, now) {
  return Array.from({ length: count }, () => {
    const rating = rng.pick(ratingPool);
    return {
      itemType,
      itemId: item._id,
      userId: null,
      authorName: rng.pick(REVIEWER_NAMES),
      rating,
      comment: rng.pick(comments[rating]),
      createdAt: new Date(now - rng.int(2, 240) * 24 * 3600 * 1000),
    };
  });
}

// Reviews belong to services (every departure of a flight number shares them) and hotels.
// Writes each item's rating summary in place.
export function generateReviews(services, hotels, { rng = createRng(23), now = Date.now() } = {}) {
  const reviews = [];
  const apply = (item, list) => {
    item.rating = list.length
      ? { average: Math.round((list.reduce((s, r) => s + r.rating, 0) / list.length) * 10) / 10, count: list.length }
      : { average: 0, count: 0 };
    reviews.push(...list);
  };
  for (const service of services) {
    apply(service, reviewsFor('service', service, rng.int(0, 4), [5, 5, 4, 4, 4, 3, 3, 2], FLIGHT_REVIEWS, rng, now));
  }
  for (const hotel of hotels) {
    const pool = hotel.starRating === 5 ? [5, 5, 5, 4, 4, 3] : hotel.starRating === 4 ? [5, 4, 4, 4, 3, 3] : [4, 4, 3, 3, 3, 2];
    apply(hotel, reviewsFor('hotel', hotel, rng.int(5, 10), pool, HOTEL_REVIEWS, rng, now));
  }
  return reviews;
}
