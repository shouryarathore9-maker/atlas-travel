// Phase 2 consoles. The Phase 1 admin inventory editor was retired (inventory moved to the managers),
// so its tests became the supplier-console tests below; access-control tests were kept.
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import AuditLog from '../models/AuditLog.js';
import Booking from '../models/Booking.js';
import Flight from '../models/Flight.js';
import Hotel from '../models/Hotel.js';
import Service from '../models/Service.js';
import { addDays, todayIstString } from '../utils/dates.js';
import { app, createService, loggedInAgent, serviceInput, supplierWithManager } from './helpers.js';

describe('console access control', () => {
  it('rejects anonymous users with 401 and the wrong roles with 403', async () => {
    await request(app).get('/api/admin/audit').expect(401);
    await request(app).get('/api/supplier/overview').expect(401);
    const traveller = await loggedInAgent();
    expect((await traveller.get('/api/admin/audit').expect(403)).body.error.code).toBe('FORBIDDEN');
    expect((await traveller.get('/api/supplier/overview').expect(403)).body.error.code).toBe('FORBIDDEN');
    const admin = await loggedInAgent({ role: 'admin' });
    await admin.get('/api/supplier/overview').expect(403);
    const { agent: manager } = await supplierWithManager('airline');
    await manager.get('/api/admin/audit').expect(403);
  });

  it('retired the Phase 1 admin inventory routes', async () => {
    const admin = await loggedInAgent({ role: 'admin' });
    await admin.get('/api/admin/flights').expect(404);
    await admin.post('/api/admin/hotels').send({}).expect(404);
  });

  it('keeps airline-only and hotel-only routes apart', async () => {
    const { agent: hotelManager } = await supplierWithManager('hotel');
    await hotelManager.get('/api/supplier/services').expect(404);
    const { agent: airlineManager } = await supplierWithManager('airline');
    await airlineManager.get('/api/supplier/hotel').expect(404);
  });
});

describe('airline manager: services and departures', () => {
  it('creates a service, materialises its departures and audit-logs it', async () => {
    const { supplier, agent } = await supplierWithManager('airline');
    const res = await agent.post('/api/supplier/services').send(serviceInput()).expect(201);
    expect(res.body.departuresAdded).toBeGreaterThan(20); // Mon/Wed/Fri over 60 days
    const flights = await Flight.find({ serviceId: res.body.service._id }).lean();
    expect(flights.every((f) => [1, 3, 5].includes(new Date(`${f.date}T00:00:00Z`).getUTCDay()))).toBe(true);
    expect(flights.every((f) => String(f.supplierId) === String(supplier._id))).toBe(true);
    const log = await AuditLog.findOne({ action: 'service.create' }).lean();
    expect(log).toMatchObject({ actorRole: 'airline_manager', supplierId: supplier._id });
  });

  it('returns field-level validation errors', async () => {
    const { agent } = await supplierWithManager('airline');
    const res = await agent
      .post('/api/supplier/services')
      .send(serviceInput({ flightNumber: 'BAD', destination: 'DEL', daysOfWeek: [], departureTime: '25:00' }))
      .expect(400);
    const paths = res.body.error.details.map((d) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['flightNumber', 'daysOfWeek', 'departureTime']));
  });

  it('rejects another airline’s flight-number prefix and the ATR on long routes', async () => {
    const { agent } = await supplierWithManager('airline');
    await agent.post('/api/supplier/services').send(serviceInput({ flightNumber: 'AI 101' })).expect(400);
    const atr = await agent.post('/api/supplier/services').send(serviceInput({ aircraftConfig: 'ATR72-600' })).expect(400); // DEL–BOM ≈ 1,140 km
    expect(atr.body.error.details[0].path).toBe('aircraftConfig');
  });

  it('editing a service rebuilds unbooked departures and keeps booked ones', async () => {
    const { agent } = await supplierWithManager('airline');
    const { body } = await agent.post('/api/supplier/services').send(serviceInput({ daysOfWeek: [0, 1, 2, 3, 4, 5, 6] })).expect(201);
    const booked = await Flight.findOne({ serviceId: body.service._id, date: addDays(todayIstString(), 5) });
    await Booking.create({ userId: booked._id, type: 'flight', itemId: booked._id, bookingReference: 'ATKEEP01' });

    const res = await agent.put(`/api/supplier/services/${body.service._id}`).send(serviceInput({ daysOfWeek: [0, 1, 2, 3, 4, 5, 6], departureTime: '18:30' })).expect(200);
    expect(res.body.keptBooked.map((f) => f.date)).toEqual([booked.date]);
    const kept = await Flight.findById(booked._id).lean();
    expect(kept.departureTime).toEqual(booked.departureTime); // unchanged
    const rebuilt = await Flight.findOne({ serviceId: body.service._id, date: addDays(todayIstString(), 6) }).lean();
    expect(new Date(rebuilt.departureTime).getUTCHours()).toBe(13); // 18:30 IST = 13:00 UTC
  });

  it('blocks deleting a service that has bookings', async () => {
    const { supplier, agent } = await supplierWithManager('airline');
    const service = await createService({ supplierId: supplier._id });
    const flight = await Flight.create({ ...(await import('./helpers.js')).flightFixture(), serviceId: service._id, supplierId: supplier._id, date: todayIstString() });
    await Booking.create({ userId: flight._id, type: 'flight', itemId: flight._id, bookingReference: 'ATTEST01' });
    const res = await agent.delete(`/api/supplier/services/${service._id}`).expect(409);
    expect(res.body.error.code).toBe('HAS_BOOKINGS');
  });

  it('stops and resumes sales on a departure, hiding it from search', async () => {
    const { agent } = await supplierWithManager('airline');
    const { body } = await agent.post('/api/supplier/services').send(serviceInput({ daysOfWeek: [0, 1, 2, 3, 4, 5, 6] })).expect(201);
    const date = addDays(todayIstString(), 3);
    const flight = await Flight.findOne({ serviceId: body.service._id, date });
    const search = () => request(app).get('/api/flights').query({ origin: 'DEL', destination: 'BOM', date }).expect(200);

    expect((await search()).body.total).toBe(1);
    await agent.post(`/api/supplier/departures/${flight._id}/stop-sales`).expect(200);
    expect((await search()).body.total).toBe(0);
    await agent.post(`/api/supplier/departures/${flight._id}/resume-sales`).expect(200);
    expect((await search()).body.total).toBe(1);
    expect(await AuditLog.countDocuments({ action: /^departure\./ })).toBe(2);
  });

  it('never shows or changes another airline’s services or departures (404)', async () => {
    const { agent: indigo } = await supplierWithManager('airline');
    const { agent: airIndia } = await supplierWithManager('airline', { name: 'Air India', code: 'AI' });
    const { body } = await indigo.post('/api/supplier/services').send(serviceInput()).expect(201);
    const flight = await Flight.findOne({ serviceId: body.service._id });

    await airIndia.get(`/api/supplier/services/${body.service._id}`).expect(404);
    await airIndia.put(`/api/supplier/services/${body.service._id}`).send(serviceInput({ flightNumber: 'AI 245' })).expect(404);
    await airIndia.delete(`/api/supplier/services/${body.service._id}`).expect(404);
    await airIndia.post(`/api/supplier/departures/${flight._id}/stop-sales`).expect(404);
    expect((await airIndia.get('/api/supplier/services').expect(200)).body.total).toBe(0);
    expect((await airIndia.get('/api/supplier/departures').expect(200)).body.total).toBe(0);
    expect(await Service.countDocuments()).toBe(1);
  });
});

describe('hotel manager: property and rooms', () => {
  const update = (hotel, roomTypes) => ({
    description: 'A calm courtyard hotel near Lodhi Garden with a quiet pool.',
    amenities: ['Free Wi-Fi', 'Spa'],
    photos: ['/images/seed/hotels/hotel-1.jpg'],
    salesStopped: false,
    roomTypes,
  });
  const room = (overrides = {}) => ({
    originalName: 'Deluxe Room',
    name: 'Deluxe Room',
    occupancy: { adults: 2, children: 1 },
    bedType: 'King bed',
    amenities: ['Minibar'],
    breakfastIncluded: true,
    price: 6000,
    taxesAndFees: 720,
    roomsTotal: 2,
    salesStopped: false,
    ...overrides,
  });

  it('updates the hotel, moves the rooms counter with the total, and audit-logs it', async () => {
    const { supplier, agent } = await supplierWithManager('hotel');
    const res = await agent.put('/api/supplier/hotel').send(update(null, [room({ roomsTotal: 5 }), room({ originalName: null, name: 'Garden Suite' })])).expect(200);
    const hotel = await Hotel.findById(supplier.hotelId).lean();
    expect(hotel.roomTypes.map((r) => r.name)).toEqual(['Deluxe Room', 'Garden Suite']);
    expect(hotel.roomTypes[0].roomsAvailable).toBe(5); // fixture had 2 available of (implicitly) 2
    expect(res.body.hotel.photos).toEqual(['/images/seed/hotels/hotel-1.jpg']);
    expect(await AuditLog.countDocuments({ action: 'hotel.update', supplierId: supplier._id })).toBe(1);
  });

  it('only accepts photos from the preset gallery', async () => {
    const { agent } = await supplierWithManager('hotel');
    const body = update(null, [room()]);
    body.photos = ['https://evil.example/x.jpg'];
    await agent.put('/api/supplier/hotel').send(body).expect(400);
  });

  it('blocks renaming or removing a room type that has bookings', async () => {
    const { supplier, agent } = await supplierWithManager('hotel');
    await Booking.create({ userId: supplier._id, type: 'hotel', itemId: supplier.hotelId, bookingReference: 'ATROOM01', selection: { roomTypeName: 'Deluxe Room', rooms: 1 } });
    const res = await agent.put('/api/supplier/hotel').send(update(null, [room({ name: 'Deluxe King' })])).expect(409);
    expect(res.body.error.code).toBe('HAS_BOOKINGS');
    await agent.put('/api/supplier/hotel').send(update(null, [room({ originalName: null, name: 'Other Room' })])).expect(409);
  });

  it('stopping hotel sales hides it from search and Best hotels', async () => {
    const { supplier, agent } = await supplierWithManager('hotel');
    await Hotel.updateOne({ _id: supplier.hotelId }, { $set: { rating: { average: 4.6, count: 8 } } });
    const date = addDays(todayIstString(), 7);
    const search = () => request(app).get('/api/hotels').query({ city: 'Delhi', checkIn: date, checkOut: addDays(date, 2) }).expect(200);
    expect((await search()).body.total).toBe(1);
    await agent.put('/api/supplier/hotel').send({ ...update(null, [room()]), salesStopped: true }).expect(200);
    expect((await search()).body.total).toBe(0);
    expect((await request(app).get('/api/hotels/featured').expect(200)).body.results).toHaveLength(0);
  });
});

describe('admin: audit log', () => {
  it('lists staff actions newest first, filterable by supplier', async () => {
    const { supplier, agent } = await supplierWithManager('airline');
    await agent.post('/api/supplier/services').send(serviceInput()).expect(201);
    const admin = await loggedInAgent({ role: 'admin' });
    const all = await admin.get('/api/admin/audit').expect(200);
    expect(all.body.items[0]).toMatchObject({ action: 'service.create', supplierName: 'IndiGo' });
    const other = await admin.get('/api/admin/audit').query({ supplierId: String(supplier._id).replace(/.$/, '0') }).expect(200);
    expect(other.body.total).toBe(0);
  });
});
