import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import Booking from '../models/Booking.js';
import Flight from '../models/Flight.js';
import { acquireLock, releaseLock } from '../models/JobLock.js';
import Review from '../models/Review.js';
import { cookieOptions } from '../middleware/auth.js';
import { MongoRateLimitStore } from '../middleware/mongoRateLimitStore.js';
import { extendFlightWindow } from '../services/flightWindow.js';
import { app, createFlight } from './helpers.js';

describe('MongoDB rate-limit store', () => {
  it('counts hits across store instances (like separate function instances) and restarts after the window', async () => {
    const a = new MongoRateLimitStore({ prefix: 'auth:' });
    const b = new MongoRateLimitStore({ prefix: 'auth:' });
    a.init({ windowMs: 60_000 });
    b.init({ windowMs: 60_000 });
    expect((await a.increment('1.2.3.4')).totalHits).toBe(1);
    expect((await b.increment('1.2.3.4')).totalHits).toBe(2); // shared, not per-instance
    expect((await a.increment('5.6.7.8')).totalHits).toBe(1); // separate key

    const short = new MongoRateLimitStore({ prefix: 'auth:' });
    short.init({ windowMs: 1 });
    await short.increment('9.9.9.9');
    await new Promise((r) => setTimeout(r, 10));
    expect((await short.increment('9.9.9.9')).totalHits).toBe(1); // window ended → restart

    await a.decrement('1.2.3.4');
    expect((await a.get('1.2.3.4')).totalHits).toBe(1);
    await a.resetKey('1.2.3.4');
    expect(await a.get('1.2.3.4')).toBeUndefined();
  });
});

describe('auth cookie', () => {
  afterEach(() => {
    delete process.env.VERCEL;
  });

  it('is Secure + SameSite=Lax on Vercel, and not Secure for local http', () => {
    expect(cookieOptions()).toMatchObject({ httpOnly: true, secure: false, sameSite: 'lax' });
    process.env.VERCEL = '1';
    expect(cookieOptions()).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax' });
  });
});

describe('cron: extend flights', () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('rejects calls without the right secret', async () => {
    await request(app).get('/api/cron/extend-flights').expect(401); // no secret configured
    process.env.CRON_SECRET = 'test-cron-secret-123';
    await request(app).get('/api/cron/extend-flights').expect(401);
    await request(app).get('/api/cron/extend-flights').set('Authorization', 'Bearer wrong').expect(401);
  });

  it('fills every missing day, is idempotent, and prunes old unbooked flights only', async () => {
    const now = Date.now();
    // An old flight nobody booked, and an old flight with a booking
    const oldUnbooked = await createFlight({ departureTime: new Date(now - 3 * 86400e3), arrivalTime: new Date(now - 3 * 86400e3 + 7200e3) });
    const oldBooked = await createFlight({ departureTime: new Date(now - 3 * 86400e3), arrivalTime: new Date(now - 3 * 86400e3 + 7200e3) });
    await Booking.create({ userId: oldBooked._id, type: 'flight', itemId: oldBooked._id, bookingReference: 'ATOLD001' });

    process.env.CRON_SECRET = 'test-cron-secret-123';
    const first = await request(app).get('/api/cron/extend-flights').set('Authorization', 'Bearer test-cron-secret-123').expect(200);
    expect(first.body.skipped).toBe(false);
    expect(first.body.daysFilled.length).toBeGreaterThanOrEqual(20); // today may be partly past
    expect(first.body.flightsAdded).toBeGreaterThan(0);
    expect(first.body.flightsPruned).toBe(1);
    expect(await Flight.exists({ _id: oldUnbooked._id })).toBeNull();
    expect(await Flight.exists({ _id: oldBooked._id })).not.toBeNull();
    expect(await Review.countDocuments({ itemType: 'flight' })).toBeGreaterThan(0);

    const count = await Flight.countDocuments();
    const second = await extendFlightWindow({ now });
    expect(second).toMatchObject({ skipped: false, flightsAdded: 0, flightsPruned: 0 });
    expect(await Flight.countDocuments()).toBe(count);
  }, 60_000);

  it('repairs a gap left by a missed run without touching other days', async () => {
    const now = Date.now();
    await extendFlightWindow({ days: 5, now });
    const dayThree = new Date(now + 3 * 86400e3);
    const ist = new Date(dayThree.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
    const [y, m, d] = ist.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, d) - 5.5 * 3600e3);
    const removed = await Flight.deleteMany({ departureTime: { $gte: start, $lt: new Date(start.getTime() + 86400e3) } });
    expect(removed.deletedCount).toBeGreaterThan(0);

    const repair = await extendFlightWindow({ days: 5, now });
    expect(repair.daysFilled).toEqual([ist]);
    expect(repair.flightsAdded).toBe(removed.deletedCount);
  }, 60_000);

  it('does not run twice at the same time', async () => {
    expect(await acquireLock('extend-flights', 60_000)).toBe(true);
    expect(await extendFlightWindow({ days: 2 })).toMatchObject({ skipped: true });
    await releaseLock('extend-flights');
    expect((await extendFlightWindow({ days: 2 })).skipped).toBe(false);
  }, 60_000);
});
