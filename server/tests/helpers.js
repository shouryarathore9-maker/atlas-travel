import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../app.js';
import Flight from '../models/Flight.js';
import Hotel from '../models/Hotel.js';
import Service from '../models/Service.js';
import Supplier from '../models/Supplier.js';
import User from '../models/User.js';
import { defaultAirlineRateCard, defaultHotelRateCard } from '../services/pricing.js';
import { addDays, istMidnight, todayIstString } from '../utils/dates.js';

export const app = createApp();
export const PASSWORD = 'Secret123';

let seq = 0;
export async function loggedInAgent({ role = 'traveler', email = `${role}-${Date.now()}-${++seq}@example.com`, supplierId = null } = {}) {
  await User.create({ name: 'Test User', email, role, supplierId, passwordHash: await bcrypt.hash(PASSWORD, 4) });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
  return agent;
}

export const futureDate = (days = 10) => addDays(todayIstString(), days);

// Rate cards with every optional rule switched off, so prices in tests are exact:
// flights cost `price` per traveller on Saver (×1.2 on Flexi, ×3 base on Business),
// rooms cost their base rate per night (×0.9 non-refundable).
const off = (rule) => ({ ...rule, enabled: false });
export function flatAirlineCard(price = 5000, route = ['DEL', 'BOM']) {
  const card = defaultAirlineRateCard('IndiGo');
  return {
    ...card,
    timeOfDay: off(card.timeOfDay),
    dayOfWeek: off(card.dayOfWeek),
    daysToDeparture: off(card.daysToDeparture),
    demand: off(card.demand),
    seasons: off(card.seasons),
    routeOverrides: { enabled: true, list: [{ origin: route[0], destination: route[1], fixedBase: price }] },
  };
}
export function flatHotelCard(baseRates = { 'Deluxe Room': 6000 }) {
  const card = defaultHotelRateCard({ baseRates, flexibleTemplate: 'H-FREE2' });
  return { ...card, dayOfWeek: off(card.dayOfWeek), seasons: off(card.seasons), leadTime: off(card.leadTime), occupancy: off(card.occupancy) };
}

export async function testAirline(overrides = {}) {
  return Supplier.create({ kind: 'airline', name: 'IndiGo', code: '6E', slug: `indigo-${++seq}`, rateCard: flatAirlineCard(), policies: {}, ...overrides });
}

// A321neo two-class: business rows 1–4, economy rows 5–32 (extra legroom 5, 15, 16). 6A is taken.
export function flightFixture(overrides = {}) {
  const date = futureDate(10);
  const departure = new Date(istMidnight(date).getTime() + 9 * 3600 * 1000);
  return {
    airline: 'IndiGo',
    flightNumber: '6E 204',
    aircraftType: 'Airbus A321neo',
    aircraftConfig: 'A321neo-2',
    origin: { code: 'DEL', city: 'Delhi', airport: 'IGI' },
    destination: { code: 'BOM', city: 'Mumbai', airport: 'CSMIA' },
    departureTime: departure,
    arrivalTime: new Date(departure.getTime() + 130 * 60000),
    durationMinutes: 130,
    stops: 0,
    cabins: { economy: { capacity: 10, sold: 0 }, business: { capacity: 4, sold: 0 } },
    seatMap: { unavailableSeats: ['6A'], blockedSeats: [] },
    ...overrides,
  };
}

// Creates a departure; without a supplierId it gets its own test airline with the flat rate card.
export async function createFlight(overrides = {}) {
  const supplierId = overrides.supplierId ?? (await testAirline({ name: overrides.airline || 'IndiGo' }))._id;
  return Flight.create(flightFixture({ ...overrides, supplierId }));
}

export function hotelFixture(overrides = {}) {
  return {
    name: 'Test Courtyard',
    city: 'Delhi',
    address: 'Lodhi Estate',
    starRating: 4,
    amenities: ['Free Wi-Fi', 'Spa'],
    photos: [],
    roomTypes: [{ name: 'Deluxe Room', occupancy: { adults: 2, children: 1 }, taxesAndFees: 720, roomsTotal: 2 }],
    ...overrides,
  };
}

// Creates a hotel with its own supplier and a flat rate card (every room type at `rate` per night).
export async function createHotel(overrides = {}, { rate = 6000 } = {}) {
  const hotel = new Hotel(hotelFixture(overrides));
  const supplier = await Supplier.create({
    kind: 'hotel',
    name: hotel.name,
    hotelId: hotel._id,
    slug: `hotel-${++seq}`,
    rateCard: flatHotelCard(Object.fromEntries(hotel.roomTypes.map((r) => [r.name, rate]))),
  });
  hotel.supplierId = supplier._id;
  await hotel.save();
  return hotel;
}

// A supplier organisation and its signed-in manager.
export async function supplierWithManager(kind = 'airline', overrides = {}) {
  let supplier;
  if (kind === 'airline') {
    supplier = await testAirline(overrides);
  } else {
    const hotel = await createHotel({ name: overrides.name || 'Test Courtyard' });
    supplier = await Supplier.findById(hotel.supplierId);
  }
  const agent = await loggedInAgent({ role: kind === 'airline' ? 'airline_manager' : 'hotel_manager', supplierId: supplier._id });
  return { supplier, agent };
}

export function serviceFixture(overrides = {}) {
  return {
    airline: 'IndiGo',
    flightNumber: '6E 204',
    origin: { code: 'DEL', city: 'Delhi', airport: 'IGI' },
    destination: { code: 'BOM', city: 'Mumbai', airport: 'CSMIA' },
    aircraftConfig: 'A320neo-1',
    departureMinute: 9 * 60,
    durationMinutes: 130,
    stops: 0,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    startDate: todayIstString(),
    ...overrides,
  };
}

export const createService = (overrides) => Service.create(serviceFixture(overrides));

// Request body for POST/PUT /api/supplier/services
export function serviceInput(overrides = {}) {
  return {
    flightNumber: '6E 245',
    origin: 'DEL',
    destination: 'BOM',
    aircraftConfig: 'A320neo-1',
    departureTime: '09:15',
    durationMinutes: 130,
    stops: 0,
    daysOfWeek: [1, 3, 5],
    startDate: todayIstString(),
    endDate: null,
    ...overrides,
  };
}

// Traveller and guest names are split into first and last (Phase 2).
export const person = (first = 'Priya', last = 'Sharma', ageCategory = 'adult') => ({ firstName: first, lastName: last, ageCategory });
export const contact = { email: 'priya@example.com', phone: '9876543210' };

export function hotelBooking(hotel, overrides = {}) {
  return {
    type: 'hotel',
    itemId: String(hotel._id),
    roomTypeName: 'Deluxe Room',
    ratePlan: 'flexible',
    rooms: 1,
    checkIn: futureDate(5),
    checkOut: futureDate(7),
    adults: 2,
    children: 0,
    guests: [{ firstName: 'Rohan', lastName: 'Mehta' }],
    contact,
    ...overrides,
  };
}

export function flightBooking(flight, overrides = {}) {
  return {
    type: 'flight',
    itemId: String(flight._id),
    fareType: 'Flexi',
    travellers: [{ ...person(), seat: '12A', meal: 'Vegetable biryani' }],
    contact,
    ...overrides,
  };
}

export const pay = (agent, booking, extra = {}) =>
  agent.post('/api/payments/mock').send({ idempotencyKey: `key-${Date.now()}-${++seq}`, method: 'upi', booking, ...extra });
