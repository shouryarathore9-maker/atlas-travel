import mongoose from 'mongoose';
import { addDays, istMidnight, todayIstString } from '../utils/dates.js';
import {
  AIRLINES,
  CITIES,
  FLIGHT_REVIEWS,
  HOTEL_AMENITIES,
  HOTEL_PHOTO_COUNT,
  HOTEL_REVIEWS,
  HOTELS_BY_CITY,
  MEALS,
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

const round = (n, step) => Math.round(n / step) * step;

function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

const SEAT_LETTERS = 'ABCDEF';
const DEPARTURE_SLOTS = [6 * 60 + 5, 9 * 60 + 40, 14 * 60 + 15, 19 * 60 + 50];

export function generateFlights({ days = 21, now = Date.now(), rng = createRng(7) } = {}) {
  const byCode = Object.fromEntries(CITIES.map((c) => [c.code, c]));
  const routes = ROUTE_PAIRS.flatMap(([a, b]) => [[a, b], [b, a]]);
  const today = todayIstString(now);
  const flights = [];

  routes.forEach(([from, to], routeIndex) => {
    const origin = byCode[from];
    const destination = byCode[to];
    const km = distanceKm(origin, destination);
    const baseDuration = round(45 + km / 12, 5);
    const basePrice = round(2200 + km * 3.6, 50);

    // Four fixed daily services per route, each with its own airline, number and timing.
    const services = DEPARTURE_SLOTS.map((slot, i) => {
      const airline = AIRLINES[(routeIndex + i) % AIRLINES.length];
      const stops = i === 3 && rng.next() < 0.5 ? 1 : 0;
      return {
        airline,
        stops,
        minuteOfDay: slot + rng.int(-20, 20),
        flightNumber: `${airline.code} ${rng.int(101, 989)}`,
        duration: baseDuration + (stops ? 95 : 0),
        priceFactor: 0.9 + rng.next() * 0.3 - stops * 0.08,
        meals: rng.sample(MEALS, rng.int(3, 5)),
      };
    });

    for (let day = 0; day < days; day++) {
      const dateStr = addDays(today, day);
      const midnight = istMidnight(dateStr).getTime();
      for (const service of services) {
        const departure = new Date(midnight + service.minuteOfDay * 60000);
        if (departure.getTime() < now + 2 * 3600 * 1000) continue;
        const arrival = new Date(departure.getTime() + service.duration * 60000);
        const urgency = day < 3 ? 1.18 : day < 7 ? 1.06 : 1;
        const saver = round(basePrice * service.priceFactor * urgency * (0.92 + rng.next() * 0.16), 50);

        const fareOptions = [
          {
            type: 'Saver',
            price: saver,
            cabinBaggageKg: 7,
            checkinBaggageKg: 15,
            cancellationPolicy: { freeUntilHoursBeforeDeparture: 0, feeAfterCutoff: 3500 },
            dateChangeFee: 3000,
            seatsAvailable: rng.int(20, 60),
          },
          {
            type: 'Flexi',
            price: round(saver * 1.22, 50),
            cabinBaggageKg: 7,
            checkinBaggageKg: 20,
            cancellationPolicy: { freeUntilHoursBeforeDeparture: 24, feeAfterCutoff: 1500 },
            dateChangeFee: 0,
            seatsAvailable: rng.int(10, 30),
          },
        ];
        if (service.airline.business) {
          fareOptions.push({
            type: 'Business',
            price: round(saver * 3.1, 50),
            cabinBaggageKg: 12,
            checkinBaggageKg: 35,
            cancellationPolicy: { freeUntilHoursBeforeDeparture: 6, feeAfterCutoff: 1000 },
            dateChangeFee: 0,
            seatsAvailable: rng.int(6, 12),
          });
        }

        const unavailable = new Set();
        const taken = rng.int(12, 30);
        while (unavailable.size < taken) unavailable.add(`${rng.int(1, 30)}${SEAT_LETTERS[rng.int(0, 5)]}`);

        flights.push({
          _id: new mongoose.Types.ObjectId(),
          airline: service.airline.name,
          flightNumber: service.flightNumber,
          aircraftType: service.airline.aircraft,
          origin: { code: origin.code, city: origin.city, airport: origin.airport },
          destination: { code: destination.code, city: destination.city, airport: destination.airport },
          departureTime: departure,
          arrivalTime: arrival,
          durationMinutes: service.duration,
          stops: service.stops,
          fareOptions,
          mealOptions: service.meals,
          seatMap: {
            rows: 30,
            columns: 6,
            unavailableSeats: [...unavailable],
            seatPricing: { window: 350, aisle: 300, middle: 0 },
          },
          rating: { average: 0, count: 0 },
        });
      }
    }
  });
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
        return {
          name: room.name,
          occupancy: room.occupancy,
          bedType: room.bedType,
          amenities: rng.sample(ROOM_AMENITIES, rng.int(3, 6)),
          breakfastIncluded: rng.next() < (stars === 3 ? 0.3 : 0.6),
          price,
          taxesAndFees: round(price * (price > 7500 ? 0.18 : 0.12), 10),
          cancellationPolicy: { freeUntilDaysBeforeCheckIn: freeDays, feeAfterCutoff: price },
          roomsAvailable: rng.int(3, 10),
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

// Generates reviews and writes each item's rating summary in place.
export function generateReviews(flights, hotels, { rng = createRng(23), now = Date.now() } = {}) {
  const reviews = [];
  const apply = (item, list) => {
    item.rating = list.length
      ? { average: Math.round((list.reduce((s, r) => s + r.rating, 0) / list.length) * 10) / 10, count: list.length }
      : { average: 0, count: 0 };
    reviews.push(...list);
  };
  for (const flight of flights) {
    apply(flight, reviewsFor('flight', flight, rng.int(0, 4), [5, 5, 4, 4, 4, 3, 3, 2], FLIGHT_REVIEWS, rng, now));
  }
  for (const hotel of hotels) {
    const pool = hotel.starRating === 5 ? [5, 5, 5, 4, 4, 3] : hotel.starRating === 4 ? [5, 4, 4, 4, 3, 3] : [4, 4, 3, 3, 3, 2];
    apply(hotel, reviewsFor('hotel', hotel, rng.int(5, 10), pool, HOTEL_REVIEWS, rng, now));
  }
  return reviews;
}
