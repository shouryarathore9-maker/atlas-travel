import { z } from 'zod';
import Booking from '../models/Booking.js';
import Flight from '../models/Flight.js';
import Hotel from '../models/Hotel.js';
import Review from '../models/Review.js';
import { HttpError } from '../utils/httpError.js';

const money = z.coerce.number().min(0, 'Must be 0 or more');
const count = z.coerce.number().int().min(0, 'Must be 0 or more');
const requiredText = (label) => z.string().trim().min(1, `${label} is required`);

const airportSchema = z.object({
  code: z.string().trim().toUpperCase().length(3, 'Airport code must be 3 letters'),
  city: requiredText('City'),
  airport: z.string().trim().default(''),
});

export const flightInputSchema = z
  .object({
    airline: requiredText('Airline'),
    flightNumber: requiredText('Flight number'),
    aircraftType: z.string().trim().default('Airbus A320neo'),
    origin: airportSchema,
    destination: airportSchema,
    departureTime: z.coerce.date({ error: 'Departure time is required' }),
    arrivalTime: z.coerce.date({ error: 'Arrival time is required' }),
    stops: count.max(3).default(0),
    fareOptions: z
      .array(
        z.object({
          type: requiredText('Fare type'),
          price: money,
          cabinBaggageKg: count.default(7),
          checkinBaggageKg: count.default(15),
          cancellationPolicy: z.object({ freeUntilHoursBeforeDeparture: count, feeAfterCutoff: money }),
          dateChangeFee: money.default(0),
          seatsAvailable: count,
        }),
      )
      .min(1, 'Add at least one fare option'),
    mealOptions: z
      .array(z.object({ name: requiredText('Meal name'), price: money, isVeg: z.boolean().default(true) }))
      .default([]),
    seatMap: z.object({
      rows: z.coerce.number().int().min(1).max(60),
      columns: z.coerce.number().int().min(2).max(10),
      unavailableSeats: z.array(z.string().trim().toUpperCase()).default([]),
      seatPricing: z.object({ window: money, aisle: money, middle: money }),
    }),
  })
  .refine((f) => f.arrivalTime > f.departureTime, { message: 'Arrival must be after departure', path: ['arrivalTime'] })
  .refine((f) => f.origin.code !== f.destination.code, { message: 'Origin and destination must differ', path: ['destination', 'code'] });

export const hotelInputSchema = z.object({
  name: requiredText('Hotel name'),
  city: requiredText('City'),
  address: z.string().trim().default(''),
  description: z.string().trim().max(2000).default(''),
  starRating: z.coerce.number().int().min(1).max(5),
  amenities: z.array(z.string().trim().min(1)).default([]),
  photos: z.array(z.string().trim().min(1)).default([]),
  roomTypes: z
    .array(
      z.object({
        name: requiredText('Room name'),
        occupancy: z.object({ adults: z.coerce.number().int().min(1).max(8), children: count.max(6) }),
        bedType: z.string().trim().default('King bed'),
        amenities: z.array(z.string().trim().min(1)).default([]),
        breakfastIncluded: z.boolean().default(false),
        price: money,
        taxesAndFees: money.default(0),
        cancellationPolicy: z.object({ freeUntilDaysBeforeCheckIn: count.max(30), feeAfterCutoff: money }),
        roomsAvailable: count,
      }),
    )
    .min(1, 'Add at least one room type')
    .refine((rooms) => new Set(rooms.map((r) => r.name)).size === rooms.length, 'Room type names must be unique'),
});

export const adminListSchema = z.object({
  q: z.string().trim().max(60).optional().default(''),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function paged(Model, filter, sort, { page, limit }) {
  const [items, total] = await Promise.all([
    Model.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
    Model.countDocuments(filter),
  ]);
  return { items, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

async function assertNoBookings(itemId, label) {
  if (await Booking.exists({ itemId })) {
    throw new HttpError(
      409,
      `This ${label} has bookings attached, so it can't be deleted. Edit it instead, or wait until those trips are over.`,
      'HAS_BOOKINGS',
    );
  }
}

// ---- Flights ----
export async function listFlights(req, res) {
  const { q, ...page } = req.validated.query;
  const rx = new RegExp(escapeRegex(q), 'i');
  const filter = q
    ? { $or: [{ flightNumber: rx }, { airline: rx }, { 'origin.city': rx }, { 'destination.city': rx }, { 'origin.code': rx }, { 'destination.code': rx }] }
    : {};
  res.json(await paged(Flight, filter, { departureTime: 1 }, page));
}

export async function getFlightAdmin(req, res) {
  const flight = await Flight.findById(req.params.id).lean();
  if (!flight) throw new HttpError(404, 'Flight not found', 'NOT_FOUND');
  res.json({ flight });
}

const withDuration = (data) => ({
  ...data,
  durationMinutes: Math.round((data.arrivalTime - data.departureTime) / 60000),
});

export async function createFlight(req, res) {
  const flight = await Flight.create(withDuration(req.validated.body));
  res.status(201).json({ flight });
}

export async function updateFlight(req, res) {
  const flight = await Flight.findByIdAndUpdate(req.params.id, withDuration(req.validated.body), {
    returnDocument: 'after',
    runValidators: true,
  });
  if (!flight) throw new HttpError(404, 'Flight not found', 'NOT_FOUND');
  res.json({ flight });
}

export async function deleteFlight(req, res) {
  const flight = await Flight.findById(req.params.id);
  if (!flight) throw new HttpError(404, 'Flight not found', 'NOT_FOUND');
  await assertNoBookings(flight._id, 'flight');
  await Promise.all([flight.deleteOne(), Review.deleteMany({ itemType: 'flight', itemId: flight._id })]);
  res.json({ ok: true });
}

// ---- Hotels ----
export async function listHotels(req, res) {
  const { q, ...page } = req.validated.query;
  const rx = new RegExp(escapeRegex(q), 'i');
  const filter = q ? { $or: [{ name: rx }, { city: rx }] } : {};
  res.json(await paged(Hotel, filter, { city: 1, name: 1 }, page));
}

export async function getHotelAdmin(req, res) {
  const hotel = await Hotel.findById(req.params.id).lean();
  if (!hotel) throw new HttpError(404, 'Hotel not found', 'NOT_FOUND');
  res.json({ hotel });
}

export async function createHotel(req, res) {
  const hotel = await Hotel.create(req.validated.body);
  res.status(201).json({ hotel });
}

export async function updateHotel(req, res) {
  const hotel = await Hotel.findByIdAndUpdate(req.params.id, req.validated.body, { returnDocument: 'after', runValidators: true });
  if (!hotel) throw new HttpError(404, 'Hotel not found', 'NOT_FOUND');
  res.json({ hotel });
}

export async function deleteHotel(req, res) {
  const hotel = await Hotel.findById(req.params.id);
  if (!hotel) throw new HttpError(404, 'Hotel not found', 'NOT_FOUND');
  await assertNoBookings(hotel._id, 'hotel');
  await Promise.all([hotel.deleteOne(), Review.deleteMany({ itemType: 'hotel', itemId: hotel._id })]);
  res.json({ ok: true });
}
