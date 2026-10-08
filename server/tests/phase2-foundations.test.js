// Phase 2, Stage 1: sandbox isolation, notifications, the daily job, booking limits and reviews per service.
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import Booking from '../models/Booking.js';
import Flight from '../models/Flight.js';
import Hotel from '../models/Hotel.js';
import { acquireLock, releaseLock } from '../models/JobLock.js';
import Notification from '../models/Notification.js';
import Review from '../models/Review.js';
import { runDailyJob, returnHotelRooms } from '../services/dailyJob.js';
import { materialiseDepartures } from '../services/schedule.js';
import { addDays, todayIstString } from '../utils/dates.js';
import { runWithContext } from '../utils/context.js';
import { app, createHotel, createService, flightFixture, loggedInAgent, supplierWithManager } from './helpers.js';

const contact = { email: 'a@example.com', phone: '9876543210' };

describe('sandbox scope plugin', () => {
  it('keeps real requests and sandbox requests apart', async () => {
    const sandboxId = new mongoose.Types.ObjectId();
    const real = await Hotel.create({ name: 'Real', city: 'Delhi', starRating: 4, roomTypes: [{ name: 'R', price: 1, roomsAvailable: 1 }] });
    const fake = await runWithContext({ sandboxId }, () =>
      Hotel.create({ name: 'Sandbox', city: 'Delhi', starRating: 4, roomTypes: [{ name: 'R', price: 1, roomsAvailable: 1 }] }),
    );
    expect(String(fake.sandboxId)).toBe(String(sandboxId));

    const inReal = await runWithContext({ sandboxId: null }, () => Hotel.find().lean());
    expect(inReal.map((h) => h.name)).toEqual(['Real']);
    const inSandbox = await runWithContext({ sandboxId }, () => Hotel.find().lean());
    expect(inSandbox.map((h) => h.name)).toEqual(['Sandbox']);

    // A sandbox request can't reach a real document even by its id, nor change it.
    expect(await runWithContext({ sandboxId }, () => Hotel.findById(real._id))).toBeNull();
    await runWithContext({ sandboxId }, () => Hotel.updateOne({ _id: real._id }, { $set: { name: 'Hacked' } }));
    expect((await Hotel.findById(real._id)).name).toBe('Real');
    // Aggregations are scoped too.
    const counted = await runWithContext({ sandboxId: null }, () => Hotel.aggregate([{ $count: 'n' }]));
    expect(counted[0].n).toBe(1);
    // Naming another sandbox explicitly is a bug and throws.
    await expect(runWithContext({ sandboxId: null }, () => Hotel.find({ sandboxId }))).rejects.toThrow(/scope violation/);
  });

  it('public search never returns sandbox data', async () => {
    const sandboxId = new mongoose.Types.ObjectId();
    await runWithContext({ sandboxId }, () => Flight.create(flightFixture()));
    const res = await request(app).get('/api/flights').query({ origin: 'DEL', destination: 'BOM', date: addDays(todayIstString(), 10) }).expect(200);
    expect(res.body.total).toBe(0);
  });
});

describe('notifications', () => {
  it('lists, counts and marks a user’s own notifications only', async () => {
    const alice = await loggedInAgent();
    const bob = await loggedInAgent();
    const aliceId = (await alice.get('/api/auth/me')).body.user.id;
    const bobId = (await bob.get('/api/auth/me')).body.user.id;
    await Notification.create([
      { userId: aliceId, type: 't', title: 'One' },
      { userId: aliceId, type: 't', title: 'Two' },
      { userId: bobId, type: 't', title: 'Bob only' },
    ]);
    const list = await alice.get('/api/notifications').expect(200);
    expect(list.body.unread).toBe(2);
    expect(list.body.notifications.map((n) => n.title)).toEqual(expect.arrayContaining(['One', 'Two']));
    expect(list.body.notifications.map((n) => n.title)).not.toContain('Bob only');

    const bobsNote = await Notification.findOne({ userId: bobId });
    await alice.post(`/api/notifications/${bobsNote._id}/read`).expect(404); // not hers
    await alice.post(`/api/notifications/${list.body.notifications[0]._id}/read`).expect(200);
    expect((await alice.get('/api/notifications/unread-count')).body.unread).toBe(1);
    await alice.post('/api/notifications/read-all').expect(200);
    expect((await alice.get('/api/notifications/unread-count')).body.unread).toBe(0);
    expect((await bob.get('/api/notifications/unread-count')).body.unread).toBe(1);
  });

  it('notifies the supplier and the traveller when a booking is paid and cancelled', async () => {
    const { supplier, agent: manager } = await supplierWithManager('hotel');
    const traveller = await loggedInAgent();
    const checkIn = addDays(todayIstString(), 10);
    const pay = await traveller
      .post('/api/payments/mock')
      .send({
        idempotencyKey: 'notify-booking-1',
        method: 'upi',
        booking: { type: 'hotel', itemId: String(supplier.hotelId), roomTypeName: 'Deluxe Room', rooms: 1, checkIn, checkOut: addDays(checkIn, 2), adults: 2, children: 0, guests: [{ name: 'Asha Rao', ageCategory: 'adult' }], contact },
      })
      .expect(201);
    expect(String(pay.body.booking.supplierId)).toBe(String(supplier._id));
    expect((await manager.get('/api/notifications')).body.notifications[0].type).toBe('booking.new');

    await traveller.patch(`/api/bookings/${pay.body.booking._id}/cancel`).expect(200);
    const travellerTypes = (await traveller.get('/api/notifications')).body.notifications.map((n) => n.type);
    expect(travellerTypes).toEqual(expect.arrayContaining(['booking.confirmed', 'refund.receipt']));
    expect((await manager.get('/api/notifications')).body.notifications[0].type).toBe('booking.cancelled_by_traveller');
  });
});

describe('booking rules', () => {
  const hotelBooking = (hotel, key, checkIn = addDays(todayIstString(), 10)) => ({
    idempotencyKey: key,
    method: 'upi',
    booking: { type: 'hotel', itemId: String(hotel._id), roomTypeName: 'Deluxe Room', rooms: 1, checkIn, checkOut: addDays(checkIn, 1), adults: 2, children: 0, guests: [{ name: 'Asha Rao', ageCategory: 'adult' }], contact },
  });

  it('staff accounts can’t book', async () => {
    const hotel = await createHotel();
    for (const role of ['admin', 'airline_manager', 'hotel_manager']) {
      const agent = await loggedInAgent({ role });
      const res = await agent.post('/api/payments/mock').send(hotelBooking(hotel, `staff-${role}`)).expect(403);
      expect(res.body.error.code).toBe('STAFF_CANNOT_BOOK');
    }
  });

  it('caps upcoming hotel stays at 5 per account', async () => {
    const hotel = await createHotel({ roomTypes: [{ name: 'Deluxe Room', occupancy: { adults: 2, children: 1 }, price: 5000, taxesAndFees: 600, cancellationPolicy: { freeUntilDaysBeforeCheckIn: 1, feeAfterCutoff: 5000 }, roomsAvailable: 20 }] });
    const traveller = await loggedInAgent();
    for (let i = 0; i < 5; i++) {
      const r = await traveller.post('/api/payments/mock').send(hotelBooking(hotel, `stay-key-${i}`));
      expect(r.status, JSON.stringify(r.body)).toBe(201);
    }
    const sixth = await traveller.post('/api/payments/mock').send(hotelBooking(hotel, 'stay-key-6')).expect(409);
    expect(sixth.body.error.code).toBe('STAY_LIMIT');
    // Cancelling one frees a slot.
    const [first] = (await traveller.get('/api/bookings/me')).body.bookings;
    await traveller.patch(`/api/bookings/${first._id}/cancel`).expect(200);
    await traveller.post('/api/payments/mock').send(hotelBooking(hotel, 'stay-key-7')).expect(201);
  });

  it('flights and stays can be booked up to 60 days ahead', async () => {
    const hotel = await createHotel();
    const tooFar = addDays(todayIstString(), 60);
    const lastDay = addDays(todayIstString(), 59);
    const search = await request(app).get('/api/hotels').query({ city: 'Delhi', checkIn: tooFar, checkOut: addDays(tooFar, 1) }).expect(200);
    expect(search.body.tooFar).toBe(true);
    expect((await request(app).get('/api/hotels').query({ city: 'Delhi', checkIn: lastDay, checkOut: tooFar }).expect(200)).body.total).toBe(1);
    const flights = await request(app).get('/api/flights').query({ origin: 'DEL', destination: 'BOM', date: tooFar }).expect(200);
    expect(flights.body.tooFar).toBe(true);
    const traveller = await loggedInAgent();
    await traveller.post('/api/payments/mock').send(hotelBooking(hotel, 'far-key-1', tooFar)).expect(400);
  });

  it('a cancelled or sales-stopped departure can’t be paid for', async () => {
    const flight = await Flight.create({ ...flightFixture(), salesStopped: true });
    const traveller = await loggedInAgent();
    const res = await traveller
      .post('/api/payments/mock')
      .send({ idempotencyKey: 'stopped-1', method: 'upi', booking: { type: 'flight', itemId: String(flight._id), fareType: 'Saver', travellers: [{ name: 'Asha Rao', ageCategory: 'adult' }], contact } })
      .expect(400);
    expect(res.body.error.code).toBe('NOT_ON_SALE');
  });
});

describe('reviews per service', () => {
  it('every departure of a service shows the service’s reviews', async () => {
    const { supplier } = await supplierWithManager('airline');
    const service = await createService({ supplierId: supplier._id });
    await Review.create({ itemType: 'service', itemId: service._id, rating: 5, comment: 'On time', authorName: 'Ravi' });
    await materialiseDepartures({ days: 3 });
    const flights = await Flight.find({ serviceId: service._id }).lean();
    expect(flights.length).toBeGreaterThan(1);
    for (const f of flights) {
      const detail = await request(app).get(`/api/flights/${f._id}`).expect(200);
      expect(detail.body.reviews.map((r) => r.comment)).toEqual(['On time']);
      const list = await request(app).get('/api/reviews').query({ itemType: 'flight', itemId: String(f._id) }).expect(200);
      expect(list.body.total).toBe(1);
    }
  });
});

describe('daily job', () => {
  it('rejects calls without the right secret', async () => {
    await request(app).get('/api/cron/daily').expect(401); // no secret configured
    process.env.CRON_SECRET = 'test-cron-secret-123';
    await request(app).get('/api/cron/daily').expect(401);
    await request(app).get('/api/cron/daily').set('Authorization', 'Bearer wrong').expect(401);
    delete process.env.CRON_SECRET;
  });

  it('materialises at most 10 new days per run, is idempotent, and repairs gaps', async () => {
    const { supplier } = await supplierWithManager('airline');
    const service = await createService({ supplierId: supplier._id });
    const now = Date.now();

    process.env.CRON_SECRET = 'test-cron-secret-123';
    const first = await request(app).get('/api/cron/daily').set('Authorization', 'Bearer test-cron-secret-123').expect(200);
    delete process.env.CRON_SECRET;
    expect(first.body.results.departures.daysFilled).toHaveLength(10);

    for (let i = 0; i < 6; i++) await runDailyJob({ now });
    const count = await Flight.countDocuments({ serviceId: service._id });
    expect(count).toBeGreaterThanOrEqual(59); // today's departure may already be too soon to sell
    expect((await runDailyJob({ now })).results.departures.flightsAdded).toBe(0);

    const gap = addDays(todayIstString(now), 20);
    await Flight.deleteOne({ serviceId: service._id, date: gap });
    expect((await runDailyJob({ now })).results.departures.daysFilled).toEqual([gap]);
  }, 60_000);

  it('prunes old unbooked departures only', async () => {
    const now = Date.now();
    const old = { departureTime: new Date(now - 3 * 86400e3), arrivalTime: new Date(now - 3 * 86400e3 + 7200e3) };
    const unbooked = await Flight.create(flightFixture(old));
    const booked = await Flight.create(flightFixture(old));
    await Booking.create({ userId: booked._id, type: 'flight', itemId: booked._id, bookingReference: 'ATOLD001' });
    expect((await runDailyJob({ now })).results.prune).toBe(1);
    expect(await Flight.exists({ _id: unbooked._id })).toBeNull();
    expect(await Flight.exists({ _id: booked._id })).not.toBeNull();
  });

  it('returns hotel rooms once a stay has ended, exactly once', async () => {
    const hotel = await createHotel(); // Deluxe Room: 2 available
    const base = { type: 'hotel', itemId: hotel._id, selection: { roomTypeName: 'Deluxe Room', rooms: 1 }, status: 'confirmed' };
    const past = new Date(Date.now() - 86400e3);
    await Booking.create([
      { ...base, userId: hotel._id, bookingReference: 'ATDONE01', travelDates: { start: new Date(Date.now() - 3 * 86400e3), end: past } },
      { ...base, userId: hotel._id, bookingReference: 'ATSOON01', travelDates: { start: new Date(Date.now() + 86400e3), end: new Date(Date.now() + 2 * 86400e3) } },
      { ...base, userId: hotel._id, bookingReference: 'ATSYN001', isSynthetic: true, travelDates: { start: past, end: past } },
    ]);
    expect(await returnHotelRooms()).toBe(1);
    expect(await returnHotelRooms()).toBe(0);
    expect((await Hotel.findById(hotel._id)).roomTypes[0].roomsAvailable).toBe(3);
  });

  it('does not run twice at the same time', async () => {
    expect(await acquireLock('daily-job', 60_000)).toBe(true);
    expect(await runDailyJob()).toMatchObject({ skipped: true });
    await releaseLock('daily-job');
    expect((await runDailyJob()).skipped).toBe(false);
  });

  it('trims notifications beyond 200 per user', async () => {
    const userId = new mongoose.Types.ObjectId();
    await Notification.insertMany(Array.from({ length: 205 }, (_, i) => ({ userId, type: 't', title: `n${i}`, createdAt: new Date(Date.now() - i * 1000) })));
    expect((await runDailyJob()).results.notifications).toBe(5);
    expect(await Notification.countDocuments({ userId })).toBe(200);
  });
});
