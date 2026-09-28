import request from 'supertest';
import { describe, expect, it } from 'vitest';
import Booking from '../models/Booking.js';
import { app, createFlight, createHotel, flightFixture, hotelFixture, loggedInAgent } from './helpers.js';

describe('admin access control', () => {
  it('rejects anonymous users with 401 and travellers with 403', async () => {
    await request(app).get('/api/admin/flights').expect(401);
    const traveller = await loggedInAgent();
    const res = await traveller.get('/api/admin/flights').expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('admin flights', () => {
  it('creates, updates and deletes a flight', async () => {
    const admin = await loggedInAgent({ role: 'admin' });
    const created = await admin.post('/api/admin/flights').send(flightFixture()).expect(201);
    expect(created.body.flight.durationMinutes).toBe(130);

    const id = created.body.flight._id;
    const updated = await admin.put(`/api/admin/flights/${id}`).send(flightFixture({ flightNumber: '6E 999' })).expect(200);
    expect(updated.body.flight.flightNumber).toBe('6E 999');

    await admin.delete(`/api/admin/flights/${id}`).expect(200);
    await request(app).get(`/api/flights/${id}`).expect(404);
  });

  it('returns field-level validation errors', async () => {
    const admin = await loggedInAgent({ role: 'admin' });
    const res = await admin.post('/api/admin/flights').send({ ...flightFixture(), airline: '', fareOptions: [] }).expect(400);
    const paths = res.body.error.details.map((d) => d.path);
    expect(paths).toContain('airline');
    expect(paths).toContain('fareOptions');
  });

  it('blocks deleting a flight that has bookings', async () => {
    const admin = await loggedInAgent({ role: 'admin' });
    const flight = await createFlight();
    await Booking.create({ userId: flight._id, type: 'flight', itemId: flight._id, bookingReference: 'ATTEST01' });
    const res = await admin.delete(`/api/admin/flights/${flight._id}`).expect(409);
    expect(res.body.error.code).toBe('HAS_BOOKINGS');
  });
});

describe('admin hotels', () => {
  it('creates and deletes a hotel, and blocks deletion with bookings', async () => {
    const admin = await loggedInAgent({ role: 'admin' });
    const created = await admin.post('/api/admin/hotels').send(hotelFixture()).expect(201);
    await admin.delete(`/api/admin/hotels/${created.body.hotel._id}`).expect(200);

    const hotel = await createHotel();
    await Booking.create({ userId: hotel._id, type: 'hotel', itemId: hotel._id, bookingReference: 'ATTEST02' });
    await admin.delete(`/api/admin/hotels/${hotel._id}`).expect(409);
  });

  it('rejects duplicate room type names', async () => {
    const admin = await loggedInAgent({ role: 'admin' });
    const fixture = hotelFixture();
    fixture.roomTypes.push({ ...fixture.roomTypes[0] });
    await admin.post('/api/admin/hotels').send(fixture).expect(400);
  });
});
