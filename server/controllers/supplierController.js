// Supplier console (prd.md → Supplier console). Every query here is filtered by req.supplierId,
// so a manager can only ever read or change their own airline's or hotel's data; another
// supplier's id looks exactly like a missing one (404). Every change is audit-logged.
import mongoose from 'mongoose';
import { z } from 'zod';
import Booking from '../models/Booking.js';
import Flight from '../models/Flight.js';
import Hotel from '../models/Hotel.js';
import Photo, { MAX_PHOTO_BYTES, MAX_UPLOADS_PER_HOTEL } from '../models/Photo.js';
import Review from '../models/Review.js';
import Service from '../models/Service.js';
import { AIRCRAFT, AIRCRAFT_KEYS } from '../services/aircraft.js';
import { audit, snapshot } from '../services/audit.js';
import { materialiseDepartures, rebuildServiceDepartures, WINDOW_DAYS } from '../services/schedule.js';
import { CITIES, HOTEL_AMENITIES, HOTEL_PHOTO_COUNT, MEALS, ROOM_AMENITIES } from '../seed/data.js';
import { distanceKm } from '../seed/generate.js';
import { addDays, DAY_MS, todayIstString } from '../utils/dates.js';
import { HttpError } from '../utils/httpError.js';
import { dateString, pagination } from '../utils/query.js';

const notFound = (what = 'That item') => new HttpError(404, `${what} was not found.`, 'NOT_FOUND');
const isId = (id) => mongoose.isValidObjectId(id);
const cityByCode = Object.fromEntries(CITIES.map((c) => [c.code, c]));
export const MAX_HOTEL_PHOTOS = 6;
const UPLOAD_PATH = /^\/api\/photos\/[a-f0-9]{24}$/;
const GALLERY = Array.from({ length: HOTEL_PHOTO_COUNT }, (_, i) => `/images/seed/hotels/hotel-${i + 1}.jpg`);

// ---------- Shared ----------

export async function overview(req, res) {
  const now = Date.now();
  const since = new Date(now - 30 * DAY_MS);
  const before = new Date(now - 60 * DAY_MS);
  const window = (from, to) =>
    Booking.aggregate([
      { $match: { supplierId: req.supplierId, createdAt: { $gte: from, $lt: to } } },
      { $group: { _id: null, bookings: { $sum: 1 }, revenue: { $sum: '$fareBreakdown.total' } } },
    ]);
  const [[current = {}], [previous = {}]] = await Promise.all([window(since, new Date(now)), window(before, since)]);

  let upcoming;
  if (req.supplier.kind === 'airline') {
    const twoDays = new Date(now + 2 * DAY_MS);
    upcoming = await Flight.find({ supplierId: req.supplierId, departureTime: { $gte: new Date(now), $lt: twoDays } })
      .sort({ departureTime: 1 })
      .limit(20)
      .select('flightNumber origin destination departureTime status salesStopped')
      .lean();
  } else {
    upcoming = await Booking.find({ supplierId: req.supplierId, status: 'confirmed', 'travelDates.start': { $gte: new Date(now - DAY_MS), $lt: new Date(now + 2 * DAY_MS) } })
      .sort({ 'travelDates.start': 1 })
      .limit(20)
      .select('bookingReference travellers selection travelDates')
      .lean();
  }
  res.json({
    supplier: { _id: req.supplier._id, kind: req.supplier.kind, name: req.supplier.name, code: req.supplier.code, hotelId: req.supplier.hotelId },
    kpis: {
      bookings: { current: current.bookings || 0, previous: previous.bookings || 0 },
      revenue: { current: current.revenue || 0, previous: previous.revenue || 0 },
    },
    upcoming,
  });
}

// Read-only reference data for console forms.
export function catalogue(req, res) {
  res.json({
    airports: CITIES.map(({ code, city, airport }) => ({ code, city, airport })),
    aircraft: Object.values(AIRCRAFT).map(({ key, label, maxRouteKm, cabins }) => ({ key, label, maxRouteKm: maxRouteKm || null, cabins: Object.keys(cabins) })),
    hotelAmenities: HOTEL_AMENITIES,
    roomAmenities: ROOM_AMENITIES,
    gallery: GALLERY,
    uploads: { maxCount: MAX_UPLOADS_PER_HOTEL, maxBytes: MAX_PHOTO_BYTES, maxHotelPhotos: MAX_HOTEL_PHOTOS },
    windowDays: WINDOW_DAYS,
  });
}

// ---------- Airline: services ----------

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time like 07:45');
const airportCode = z.enum(Object.keys(cityByCode), { error: 'Choose one of the 8 Atlas cities' });

export const serviceInputSchema = z
  .object({
    flightNumber: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2} \d{2,4}$/, 'Use the airline code, a space and 2–4 digits, e.g. 6E 245'),
    origin: airportCode,
    destination: airportCode,
    aircraftConfig: z.enum(AIRCRAFT_KEYS, { error: 'Choose an aircraft from the catalogue' }),
    departureTime: time,
    durationMinutes: z.coerce.number().int().min(20, 'At least 20 minutes').max(900, 'At most 15 hours'),
    stops: z.coerce.number().int().min(0).max(2).default(0),
    daysOfWeek: z.array(z.coerce.number().int().min(0).max(6)).min(1, 'Pick at least one day').transform((d) => [...new Set(d)].sort()),
    startDate: dateString,
    endDate: dateString.nullable().optional().default(null),
  })
  .refine((s) => s.origin !== s.destination, { message: 'Origin and destination must differ', path: ['destination'] })
  .refine((s) => !s.endDate || s.endDate >= s.startDate, { message: 'The end date must be on or after the start date', path: ['endDate'] })
  .refine(
    (s) => {
      const limit = AIRCRAFT[s.aircraftConfig].maxRouteKm;
      return !limit || distanceKm(cityByCode[s.origin], cityByCode[s.destination]) <= limit;
    },
    { message: 'This aircraft is only used on routes under 600 km', path: ['aircraftConfig'] },
  );

export const listQuerySchema = z.object({
  q: z.string().trim().max(60).optional().default(''),
  date: dateString.optional(),
  ...pagination,
});

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function toServiceDoc(input, supplier) {
  if (!input.flightNumber.startsWith(`${supplier.code} `)) {
    throw new HttpError(400, `Flight numbers for ${supplier.name} start with ${supplier.code}`, 'VALIDATION_ERROR');
  }
  const origin = cityByCode[input.origin];
  const destination = cityByCode[input.destination];
  const [h, m] = input.departureTime.split(':').map(Number);
  const km = distanceKm(origin, destination);
  return {
    flightNumber: input.flightNumber,
    origin: { code: origin.code, city: origin.city, airport: origin.airport },
    destination: { code: destination.code, city: destination.city, airport: destination.airport },
    aircraftConfig: input.aircraftConfig,
    departureMinute: h * 60 + m,
    durationMinutes: input.durationMinutes,
    stops: input.stops,
    daysOfWeek: input.daysOfWeek,
    startDate: input.startDate,
    endDate: input.endDate,
    // Interim Phase 1 fare level until the pricing engine replaces it (Stage 2).
    interim: { basePrice: Math.round((2200 + km * 3.6) / 50) * 50, mealOptions: MEALS.slice(0, 4) },
  };
}

const SERVICE_AUDIT_FIELDS = ['flightNumber', 'origin', 'destination', 'aircraftConfig', 'departureMinute', 'durationMinutes', 'stops', 'daysOfWeek', 'startDate', 'endDate', 'status'];
const withAircraftName = (item) => ({ ...item, aircraftName: AIRCRAFT[item.aircraftConfig]?.short || item.aircraftType || '' });
const serviceLabel = (s) => `${s.flightNumber} ${s.origin.code}→${s.destination.code}`;

export async function listServices(req, res) {
  const { q, page, limit } = req.validated.query;
  const rx = new RegExp(escapeRegex(q), 'i');
  const filter = { supplierId: req.supplierId, ...(q && { $or: [{ flightNumber: rx }, { 'origin.code': rx }, { 'destination.code': rx }, { 'origin.city': rx }, { 'destination.city': rx }] }) };
  const [items, total] = await Promise.all([
    Service.find(filter).sort({ 'origin.code': 1, 'destination.code': 1, departureMinute: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    Service.countDocuments(filter),
  ]);
  res.json({ items: items.map(withAircraftName), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
}

async function ownService(req) {
  if (!isId(req.params.id)) throw notFound('That flight');
  const service = await Service.findOne({ _id: req.params.id, supplierId: req.supplierId });
  if (!service) throw notFound('That flight');
  return service;
}

export async function getService(req, res) {
  res.json({ service: await ownService(req) });
}

export async function createService(req, res) {
  const input = req.validated.body;
  if (input.startDate < todayIstString()) throw new HttpError(400, 'The start date can’t be in the past', 'VALIDATION_ERROR');
  const doc = toServiceDoc(input, req.supplier);
  if (await Service.exists({ supplierId: req.supplierId, flightNumber: doc.flightNumber })) {
    throw new HttpError(409, `${doc.flightNumber} already exists. Edit it instead.`, 'DUPLICATE');
  }
  const service = await Service.create({ ...doc, supplierId: req.supplierId, airline: req.supplier.name });
  const result = await materialiseDepartures({ serviceIds: [service._id] });
  await audit(req, { action: 'service.create', target: { type: 'service', id: service._id, label: serviceLabel(service) }, after: snapshot(service, SERVICE_AUDIT_FIELDS) });
  res.status(201).json({ service, departuresAdded: result.flightsAdded });
}

export async function updateService(req, res) {
  const service = await ownService(req);
  const before = snapshot(service, SERVICE_AUDIT_FIELDS);
  const doc = toServiceDoc(req.validated.body, req.supplier);
  if (doc.flightNumber !== service.flightNumber && (await Service.exists({ supplierId: req.supplierId, flightNumber: doc.flightNumber }))) {
    throw new HttpError(409, `${doc.flightNumber} already exists.`, 'DUPLICATE');
  }
  service.set(doc);
  await service.save();
  const result = await rebuildServiceDepartures(service._id);
  await audit(req, { action: 'service.update', target: { type: 'service', id: service._id, label: serviceLabel(service) }, before, after: snapshot(service, SERVICE_AUDIT_FIELDS) });
  res.json({
    service,
    departuresRebuilt: result.flightsAdded,
    // Booked departures keep their old details — the console lists them for one-by-one rescheduling.
    keptBooked: result.keptBooked.map((f) => ({ _id: f._id, date: f.date, departureTime: f.departureTime })),
  });
}

export async function deleteService(req, res) {
  const service = await ownService(req);
  const departures = await Flight.find({ serviceId: service._id }, { _id: 1 }).lean();
  if (await Booking.exists({ type: 'flight', itemId: { $in: departures.map((f) => f._id) } })) {
    throw new HttpError(409, 'This flight has bookings, so it can’t be deleted. Set an end date to stop it instead.', 'HAS_BOOKINGS');
  }
  await Promise.all([
    Flight.deleteMany({ serviceId: service._id }),
    Review.deleteMany({ itemType: 'service', itemId: service._id }),
    service.deleteOne(),
  ]);
  await audit(req, { action: 'service.delete', target: { type: 'service', id: service._id, label: serviceLabel(service) }, before: snapshot(service, SERVICE_AUDIT_FIELDS) });
  res.json({ ok: true });
}

// ---------- Airline: departures ----------

export async function listDepartures(req, res) {
  const { q, date, page, limit } = req.validated.query;
  const today = todayIstString();
  const filter = {
    supplierId: req.supplierId,
    date: date ? date : { $gte: today, $lte: addDays(today, WINDOW_DAYS - 1) },
  };
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ flightNumber: rx }, { 'origin.code': rx }, { 'destination.code': rx }, { 'origin.city': rx }, { 'destination.city': rx }];
  }
  const [items, total] = await Promise.all([
    Flight.find(filter)
      .sort({ departureTime: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('flightNumber origin destination departureTime arrivalTime aircraftConfig aircraftType status salesStopped fareOptions.type fareOptions.seatsAvailable date')
      .lean(),
    Flight.countDocuments(filter),
  ]);
  const counts = await Booking.aggregate([
    { $match: { type: 'flight', status: 'confirmed', itemId: { $in: items.map((f) => f._id) } } },
    { $group: { _id: '$itemId', bookings: { $sum: 1 }, travellers: { $sum: { $size: '$travellers' } }, revenue: { $sum: '$fareBreakdown.total' } } },
  ]);
  const byId = Object.fromEntries(counts.map((c) => [String(c._id), c]));
  res.json({
    items: items.map((f) => ({ ...withAircraftName(f), bookings: byId[f._id]?.bookings || 0, travellers: byId[f._id]?.travellers || 0, revenue: byId[f._id]?.revenue || 0 })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
}

async function setDepartureSales(req, res, stopped) {
  if (!isId(req.params.id)) throw notFound('That departure');
  const flight = await Flight.findOne({ _id: req.params.id, supplierId: req.supplierId });
  if (!flight) throw notFound('That departure');
  if (flight.status === 'cancelled') throw new HttpError(409, 'This departure was cancelled.', 'NOT_ALLOWED');
  if (new Date(flight.departureTime) <= new Date()) throw new HttpError(409, 'This flight has already departed.', 'NOT_ALLOWED');
  if (flight.salesStopped !== stopped) {
    flight.salesStopped = stopped;
    await flight.save();
    await audit(req, {
      action: stopped ? 'departure.stop_sales' : 'departure.resume_sales',
      target: { type: 'flight', id: flight._id, label: `${flight.flightNumber} ${flight.date}` },
      before: { salesStopped: !stopped },
      after: { salesStopped: stopped },
    });
  }
  res.json({ flight: { _id: flight._id, salesStopped: flight.salesStopped } });
}

export const stopDepartureSales = (req, res) => setDepartureSales(req, res, true);
export const resumeDepartureSales = (req, res) => setDepartureSales(req, res, false);

// ---------- Hotel: property and rooms ----------

async function ownHotel(req) {
  const hotel = await Hotel.findOne({ _id: req.supplier.hotelId, supplierId: req.supplierId });
  if (!hotel) throw notFound('Your hotel');
  return hotel;
}

export async function getOwnHotel(req, res) {
  res.json({ hotel: await ownHotel(req) });
}

const text = (max) => z.string().trim().max(max);
const roomInput = z.object({
  originalName: z.string().trim().max(60).nullable().optional().default(null), // null = a new room type
  name: z.string().trim().min(2, 'Room name is required').max(60),
  occupancy: z.object({ adults: z.coerce.number().int().min(1).max(8), children: z.coerce.number().int().min(0).max(6) }),
  bedType: text(60).min(2, 'Bed type is required'),
  amenities: z.array(z.enum(ROOM_AMENITIES)).max(ROOM_AMENITIES.length).default([]),
  breakfastIncluded: z.boolean().default(false),
  price: z.coerce.number().int().min(500, 'At least ₹500').max(200000), // interim until the rate card (Stage 2)
  taxesAndFees: z.coerce.number().int().min(0).max(50000),
  roomsTotal: z.coerce.number().int().min(0).max(500),
  salesStopped: z.boolean().default(false),
});

export const hotelInputSchema = z.object({
  description: text(2000).min(20, 'Write at least a sentence or two'),
  amenities: z.array(z.enum(HOTEL_AMENITIES)).max(HOTEL_AMENITIES.length).default([]),
  photos: z
    .array(z.string().refine((p) => GALLERY.includes(p) || UPLOAD_PATH.test(p), 'Use gallery photos or your own uploads'))
    .min(1, 'Pick at least one photo')
    .max(MAX_HOTEL_PHOTOS, `Pick up to ${MAX_HOTEL_PHOTOS} photos`)
    .refine((list) => new Set(list).size === list.length, 'Each photo can be used once'),
  salesStopped: z.boolean().default(false),
  roomTypes: z
    .array(roomInput)
    .min(1, 'Keep at least one room type')
    .max(6)
    .refine((rooms) => new Set(rooms.map((r) => r.name.toLowerCase())).size === rooms.length, 'Room type names must be unique'),
});

const HOTEL_AUDIT_FIELDS = ['description', 'amenities', 'photos', 'salesStopped', 'roomTypes'];

export async function updateOwnHotel(req, res) {
  const hotel = await ownHotel(req);
  const input = req.validated.body;
  const before = snapshot(hotel, HOTEL_AUDIT_FIELDS);
  // Uploaded photos must be this hotel's own.
  const uploadIds = input.photos.filter((p) => UPLOAD_PATH.test(p)).map((p) => p.split('/').pop());
  if (uploadIds.length && (await Photo.countDocuments({ _id: { $in: uploadIds }, supplierId: req.supplierId })) !== uploadIds.length) {
    throw new HttpError(400, 'One of those photos isn’t one of your uploads.', 'VALIDATION_ERROR');
  }
  const existing = Object.fromEntries(hotel.roomTypes.map((r) => [r.name, r.toObject()]));

  // Room types with bookings can't be removed or renamed (bookings refer to them by name).
  const kept = new Set(input.roomTypes.map((r) => r.originalName).filter(Boolean));
  const removedOrRenamed = [
    ...Object.keys(existing).filter((name) => !kept.has(name)),
    ...input.roomTypes.filter((r) => r.originalName && r.originalName !== r.name).map((r) => r.originalName),
  ];
  for (const name of removedOrRenamed) {
    if (await Booking.exists({ type: 'hotel', itemId: hotel._id, 'selection.roomTypeName': name })) {
      throw new HttpError(409, `“${name}” has bookings, so it can’t be removed or renamed. Stop its sales instead.`, 'HAS_BOOKINGS');
    }
  }

  hotel.description = input.description;
  hotel.amenities = input.amenities;
  hotel.photos = input.photos;
  hotel.salesStopped = input.salesStopped;
  hotel.roomTypes = input.roomTypes.map(({ originalName, ...room }) => {
    const prev = originalName ? existing[originalName] : null;
    if (originalName && !prev) throw new HttpError(400, `Unknown room type “${originalName}”`, 'VALIDATION_ERROR');
    // Changing the number of rooms moves the available counter by the same amount (never below 0).
    const prevTotal = prev?.roomsTotal ?? prev?.roomsAvailable ?? 0;
    const roomsAvailable = Math.max(0, (prev?.roomsAvailable ?? 0) + room.roomsTotal - (prev ? prevTotal : 0));
    return {
      ...room,
      roomsAvailable,
      cancellationPolicy: prev?.cancellationPolicy ?? { freeUntilDaysBeforeCheckIn: 1, feeAfterCutoff: room.price },
    };
  });
  await hotel.save();
  await audit(req, { action: 'hotel.update', target: { type: 'hotel', id: hotel._id, label: hotel.name }, before, after: snapshot(hotel, HOTEL_AUDIT_FIELDS) });
  res.json({ hotel });
}
