import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../app.js';
import Flight from '../models/Flight.js';
import Hotel from '../models/Hotel.js';
import Service from '../models/Service.js';
import Supplier from '../models/Supplier.js';
import User from '../models/User.js';
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

export function flightFixture(overrides = {}) {
  const date = futureDate(10);
  const departure = new Date(istMidnight(date).getTime() + 9 * 3600 * 1000);
  return {
    airline: 'IndiGo',
    flightNumber: '6E 204',
    aircraftType: 'Airbus A320neo',
    origin: { code: 'DEL', city: 'Delhi', airport: 'IGI' },
    destination: { code: 'BOM', city: 'Mumbai', airport: 'CSMIA' },
    departureTime: departure,
    arrivalTime: new Date(departure.getTime() + 130 * 60000),
    durationMinutes: 130,
    stops: 0,
    fareOptions: [
      { type: 'Saver', price: 5000, cancellationPolicy: { freeUntilHoursBeforeDeparture: 0, feeAfterCutoff: 3500 }, seatsAvailable: 10 },
      { type: 'Flexi', price: 6000, cancellationPolicy: { freeUntilHoursBeforeDeparture: 24, feeAfterCutoff: 1500 }, seatsAvailable: 5 },
    ],
    mealOptions: [{ name: 'Vegetable biryani', price: 350, isVeg: true }],
    seatMap: { rows: 30, columns: 6, unavailableSeats: ['1A'], seatPricing: { window: 350, aisle: 300, middle: 0 } },
    ...overrides,
  };
}

export function hotelFixture(overrides = {}) {
  return {
    name: 'Test Courtyard',
    city: 'Delhi',
    address: 'Lodhi Estate',
    starRating: 4,
    amenities: ['Free Wi-Fi', 'Spa'],
    photos: [],
    roomTypes: [
      {
        name: 'Deluxe Room',
        occupancy: { adults: 2, children: 1 },
        price: 6000,
        taxesAndFees: 720,
        cancellationPolicy: { freeUntilDaysBeforeCheckIn: 2, feeAfterCutoff: 6000 },
        roomsAvailable: 2,
      },
    ],
    ...overrides,
  };
}

export const createFlight = (overrides) => Flight.create(flightFixture(overrides));
export const createHotel = (overrides) => Hotel.create(hotelFixture(overrides));

// A supplier organisation and its signed-in manager.
export async function supplierWithManager(kind = 'airline', overrides = {}) {
  const base =
    kind === 'airline'
      ? { kind, name: 'IndiGo', code: '6E', slug: `indigo-${++seq}` }
      : { kind, name: 'Test Courtyard', slug: `test-courtyard-${++seq}` };
  const supplier = await Supplier.create({ ...base, ...overrides });
  if (kind === 'hotel' && !overrides.hotelId) {
    const hotel = await createHotel({ supplierId: supplier._id, name: supplier.name });
    supplier.hotelId = hotel._id;
    await supplier.save();
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
    interim: { basePrice: 5000, mealOptions: [{ name: 'Vegetable biryani', price: 350, isVeg: true }] },
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
