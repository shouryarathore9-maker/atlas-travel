// Stage 8: visitor sandboxes — isolation, the traveller loop, caps, quotas and cleanup.
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import AuditLog from '../models/AuditLog.js';
import Booking from '../models/Booking.js';
import Flight from '../models/Flight.js';
import Sandbox from '../models/Sandbox.js';
import Supplier from '../models/Supplier.js';
import User from '../models/User.js';
import { runDailyJob } from '../services/dailyJob.js';
import { SANDBOX_MODELS } from '../services/sandbox.js';
import { app, createFlight, createHotel, flightBooking, futureDate, hotelBooking, loggedInAgent, pay, supplierWithManager } from './helpers.js';

const countSandboxDocs = async () => (await Promise.all(SANDBOX_MODELS.map((M) => M.countDocuments({ sandboxId: { $ne: null } })))).reduce((a, b) => a + b, 0);

async function airlineWithTrips() {
  const { supplier, agent: manager } = await supplierWithManager('airline');
  const flight = await createFlight({ supplierId: supplier._id, date: futureDate(3), departureTime: new Date(Date.now() + 3 * 864e5), arrivalTime: new Date(Date.now() + 3 * 864e5 + 2 * 3600e3) });
  const traveller = await loggedInAgent();
  await pay(traveller, flightBooking(flight)).expect(201);
  return { supplier, manager, flight };
}

async function startDemo(body) {
  const visitor = request.agent(app);
  const res = await visitor.post('/api/sandbox').send(body);
  return { visitor, res };
}

afterEach(() => {
  delete process.env.DEMO_MODE;
});

describe('visitor sandbox', () => {
  it('copies one airline privately; the real site and the sandbox never see each other', async () => {
    const { supplier, flight } = await airlineWithTrips();
    const { visitor, res } = await startDemo({ kind: 'airline', supplierId: String(supplier._id) });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect((await visitor.get('/api/sandbox/session').expect(200)).body).toMatchObject({ active: true, kind: 'airline', role: 'staff' });

    // The sandbox manager runs a copy: same flight numbers, different ids.
    const me = (await visitor.get('/api/sandbox/auth/me').expect(200)).body.user;
    expect(me.role).toBe('airline_manager');
    const departures = (await visitor.get('/api/sandbox/supplier/departures').expect(200)).body;
    const list = departures.items || departures.departures || departures.flights;
    expect(list.length).toBe(1);
    expect(String(list[0]._id)).not.toBe(String(flight._id));
    const copiedBookings = await Booking.countDocuments({ sandboxId: { $ne: null } });
    expect(copiedBookings).toBe(1);

    // Real ids are invisible inside the sandbox, and sandbox ids are invisible to the real site.
    await visitor.get(`/api/sandbox/flights/${flight._id}`).expect(404);
    await request(app).get(`/api/flights/${list[0]._id}`).expect(404);
    const realSearch = await request(app).get('/api/flights').query({ origin: 'DEL', destination: 'BOM', date: futureDate(3) }).expect(200);
    expect(realSearch.body.results.map((f) => String(f._id))).toEqual([String(flight._id)]);

    // The sandbox cookie is not a real session, and a real session can't use sandbox routes.
    await visitor.get('/api/supplier/overview').expect(401);
    const realManager = (await supplierWithManager('airline', { name: 'Vistara', code: 'UK' })).agent;
    await realManager.get('/api/sandbox/supplier/overview').expect(401);

    // Changes stay inside: a rate-card save is audit-logged only in the sandbox.
    const card = (await visitor.get('/api/sandbox/supplier/rate-card').expect(200)).body.rateCard;
    await visitor.put('/api/sandbox/supplier/rate-card').send({ rateCard: card }).expect(200);
    expect(await AuditLog.countDocuments({ sandboxId: null, action: 'rate_card.update' })).toBe(0);
    expect(await AuditLog.countDocuments({ sandboxId: { $ne: null }, action: 'rate_card.update' })).toBe(1);
    expect((await Supplier.findById(supplier._id)).rateCard.version).toBe(1);

    // Ending deletes every sandbox document.
    await visitor.delete('/api/sandbox').expect(200);
    expect(await countSandboxDocs()).toBe(0);
    expect(await Sandbox.countDocuments()).toBe(0);
    await visitor.get('/api/sandbox/supplier/overview').expect(401);
  });

  it('the demo traveller books the sandboxed hotel and the manager sees it; uploads are off; quotas apply', async () => {
    const hotel = await createHotel({ starRating: 5, rating: { average: 4.7, count: 30 }, roomTypes: [{ name: 'Deluxe Room', occupancy: { adults: 2, children: 1 }, taxesAndFees: 720, roomsAvailable: 5, roomsTotal: 5 }] });
    const { visitor, res } = await startDemo({ kind: 'hotel', supplierId: String(hotel.supplierId) });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await visitor.post('/api/sandbox/supplier/hotel/photos').set('Content-Type', 'image/png').send(Buffer.from([0x89, 0x50, 0x4e, 0x47])).expect(403);

    const { body: switched } = await visitor.post('/api/sandbox/switch').expect(200);
    expect(switched.role).toBe('traveller');
    const results = (await visitor.get('/api/sandbox/hotels').query({ city: 'Delhi', checkIn: futureDate(5), checkOut: futureDate(7) }).expect(200)).body.results;
    expect(results).toHaveLength(1);
    const sandboxHotel = { _id: results[0]._id };
    const booked = await visitor.post('/api/sandbox/payments/mock').send({ idempotencyKey: 'demo-key-0001', method: 'upi', booking: hotelBooking(sandboxHotel) });
    expect(booked.status, JSON.stringify(booked.body)).toBe(201);
    expect(await Booking.countDocuments({ sandboxId: null, itemId: hotel._id })).toBe(0); // nothing real

    await visitor.post('/api/sandbox/switch').expect(200);
    const reservations = (await visitor.get('/api/sandbox/supplier/reservations').expect(200)).body;
    const refs = (reservations.items || reservations.reservations).map((b) => b.bookingReference);
    expect(refs).toContain(booked.body.booking.bookingReference);

    // Quota: at the cap, the next booking is refused.
    await Sandbox.updateOne({}, { $set: { 'counts.bookings': 50 } });
    await visitor.post('/api/sandbox/switch').expect(200);
    const capped = await visitor.post('/api/sandbox/payments/mock').send({ idempotencyKey: 'demo-key-0002', method: 'upi', booking: hotelBooking(sandboxHotel) });
    expect(capped.status).toBe(409);
    expect(capped.body.error.code).toBe('SANDBOX_LIMIT');
  });

  it('admin demo: its own small dataset; actions never reach real data', async () => {
    await airlineWithTrips();
    const hotel = await createHotel({ starRating: 5, rating: { average: 4.8, count: 40 } });
    const { visitor, res } = await startDemo({ kind: 'admin' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const suppliers = (await visitor.get('/api/sandbox/admin/suppliers').expect(200)).body.suppliers;
    expect(suppliers).toHaveLength(2);
    await visitor.post(`/api/sandbox/admin/suppliers/${suppliers[1]._id}/suspend`).send({ reason: 'Trying it in the demo' }).expect(200);
    expect((await Supplier.findById(hotel.supplierId)).status).toBe('active');
    expect(await AuditLog.countDocuments({ sandboxId: null })).toBe(0);
    await visitor.get('/api/sandbox/admin/analytics').expect(200);
    await visitor.post('/api/sandbox/switch').expect(400); // no traveller view for admin
  });

  it('caps: DEMO_MODE off, 20 at once, and validation', async () => {
    const { supplier } = await airlineWithTrips();
    process.env.DEMO_MODE = 'off';
    expect((await startDemo({ kind: 'airline', supplierId: String(supplier._id) })).res.status).toBe(503);
    delete process.env.DEMO_MODE;
    expect((await startDemo({ kind: 'airline' })).res.status).toBe(400);
    expect((await startDemo({ kind: 'hotel', supplierId: String(supplier._id) })).res.status).toBe(404); // not a hotel
    const now = Date.now();
    await Sandbox.insertMany(Array.from({ length: 20 }, () => ({ kind: 'admin', expiresAt: new Date(now + 3600e3), lastSeenAt: new Date(now) })));
    const busy = await startDemo({ kind: 'airline', supplierId: String(supplier._id) });
    expect(busy.res.status).toBe(503);
    expect(busy.res.body.error.code).toBe('DEMO_BUSY');
  });

  it('idle sandboxes end; the daily job sweeps them and never touches them otherwise', async () => {
    const { supplier } = await airlineWithTrips();
    const { visitor } = await startDemo({ kind: 'airline', supplierId: String(supplier._id) });
    const realFlights = await Flight.countDocuments({ sandboxId: null });
    const run = await runDailyJob();
    expect(await Flight.countDocuments({ sandboxId: null })).toBeGreaterThanOrEqual(realFlights);
    expect(run.results.sandboxes).toEqual({ ended: 0, orphans: 0 });
    expect(await countSandboxDocs()).toBeGreaterThan(0);

    await Sandbox.updateMany({}, { $set: { lastSeenAt: new Date(Date.now() - 31 * 60 * 1000) } });
    await visitor.get('/api/sandbox/supplier/overview').expect(401); // ended on the next request
    expect(await countSandboxDocs()).toBe(0);
    expect(await User.countDocuments({ email: /sandbox\.atlas\.invalid$/ })).toBe(0);
  });
});
