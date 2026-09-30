import request from 'supertest';
import { describe, expect, it } from 'vitest';
import Review from '../models/Review.js';
import { app, createFlight, createHotel, futureDate } from './helpers.js';

describe('flight search', () => {
  it('returns matching flights sorted by price by default', async () => {
    const base = await createFlight();
    await createFlight({
      flightNumber: 'AI 101',
      airline: 'Air India',
      fareOptions: [{ type: 'Saver', price: 4000, cancellationPolicy: { freeUntilHoursBeforeDeparture: 0, feeAfterCutoff: 3000 }, seatsAvailable: 5 }],
    });
    const res = await request(app)
      .get('/api/flights')
      .query({ origin: 'DEL', destination: 'BOM', date: futureDate(10) })
      .expect(200);
    expect(res.body.total).toBe(2);
    expect(res.body.results.map((f) => f.price)).toEqual([4000, 5000]);
    expect(res.body.facets.airlines).toEqual(['Air India', 'IndiGo']);
    expect(String(res.body.results[1]._id)).toBe(String(base._id));
  });

  it('combines filters with AND logic', async () => {
    await createFlight();
    await createFlight({ airline: 'Air India', flightNumber: 'AI 1', stops: 1 });
    const res = await request(app)
      .get('/api/flights')
      .query({ origin: 'DEL', destination: 'BOM', date: futureDate(10), airlines: 'Air India', stops: '0' })
      .expect(200);
    expect(res.body.total).toBe(0);
    expect(res.body.unfilteredTotal).toBe(2);
  });

  it('returns an empty list (not an error) when nothing matches', async () => {
    const res = await request(app).get('/api/flights').query({ origin: 'DEL', destination: 'MAA', date: futureDate(3) }).expect(200);
    expect(res.body.results).toEqual([]);
  });

  it('rejects a search missing required fields', async () => {
    const res = await request(app).get('/api/flights').query({ origin: 'DEL' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns flight detail with reviews, and 404 for unknown ids', async () => {
    const flight = await createFlight();
    await Review.create({ itemType: 'flight', itemId: flight._id, rating: 5, comment: 'Great' });
    const res = await request(app).get(`/api/flights/${flight._id}`).expect(200);
    expect(res.body.reviews).toHaveLength(1);
    await request(app).get('/api/flights/64b000000000000000000000').expect(404);
  });
});

describe('hotel search', () => {
  it('finds hotels in a city case-insensitively and hides ones that cannot fit the party', async () => {
    await createHotel();
    const params = { city: 'delhi', checkIn: futureDate(5), checkOut: futureDate(7) };
    const ok = await request(app).get('/api/hotels').query({ ...params, adults: 2 }).expect(200);
    expect(ok.body.total).toBe(1);
    expect(ok.body.results[0].nights).toBe(2);
    const tooMany = await request(app).get('/api/hotels').query({ ...params, adults: 5, rooms: 1 }).expect(200);
    expect(tooMany.body.total).toBe(0);
  });

  it('lists best hotels: only 4★+ with a 4.0+ guest rating, best-rated first (story #19)', async () => {
    await createHotel({ name: 'Top Five', starRating: 5, rating: { average: 4.6, count: 9 } });
    await createHotel({ name: 'Good Four', starRating: 4, rating: { average: 4.2, count: 5 } });
    await createHotel({ name: 'Low Rated Five', starRating: 5, rating: { average: 3.8, count: 7 } });
    await createHotel({ name: 'Loved Three', starRating: 3, rating: { average: 4.8, count: 7 } });
    const res = await request(app).get('/api/hotels/featured').expect(200);
    expect(res.body.results.map((h) => h.name)).toEqual(['Top Five', 'Good Four']);
    expect(res.body.results[0]).toMatchObject({ price: 6000, photo: null });
  });

  it('rejects an invalid featured limit', async () => {
    const res = await request(app).get('/api/hotels/featured').query({ limit: 500 }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects check-out before check-in', async () => {
    const res = await request(app)
      .get('/api/hotels')
      .query({ city: 'Delhi', checkIn: futureDate(7), checkOut: futureDate(5) })
      .expect(400);
    expect(res.body.error.message).toMatch(/Check-out/);
  });
});
