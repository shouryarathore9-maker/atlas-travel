// Phase 1 booking behaviour, updated for Phase 2 (prices from the engine, split names, cabin seats).
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import Booking from '../models/Booking.js';
import Flight from '../models/Flight.js';
import Hotel from '../models/Hotel.js';
import Payment from '../models/Payment.js';
import { computeRefund } from '../services/bookingService.js';
import { app, createFlight, createHotel, flightBooking, hotelBooking, loggedInAgent, pay, person } from './helpers.js';

function flightPayment(flight, overrides = {}) {
  return { idempotencyKey: `key-${Math.random()}`, method: 'upi', booking: flightBooking(flight), ...overrides };
}

describe('mock payment → booking', () => {
  it('requires a session', async () => {
    const flight = await createFlight();
    await request(app).post('/api/payments/mock').send(flightPayment(flight)).expect(401);
  });

  it('creates a booking, prices it on the server and reserves the seat', async () => {
    const flight = await createFlight();
    const agent = await loggedInAgent();
    const res = await agent.post('/api/payments/mock').send(flightPayment(flight)).expect(201);

    const { booking } = res.body;
    expect(booking.bookingReference).toMatch(/^AT[A-Z0-9]{6}$/);
    expect(booking.pnr).toMatch(/^[A-Z0-9]{6}$/);
    expect(booking.travellers[0]).toMatchObject({ name: 'Priya Sharma', ticketNumber: expect.stringMatching(/^312\d{10}$/) });
    // Flexi 6000 + 12% taxes + 350 window seat + 350 meal
    expect(booking.fareBreakdown).toMatchObject({ base: 6000, taxes: 720, addons: 700, total: 7420 });

    const updated = await Flight.findById(flight._id);
    expect(updated.seatMap.unavailableSeats).toContain('12A');
    expect(updated.cabins.economy.sold).toBe(1);
    expect(await Payment.countDocuments({ status: 'success' })).toBe(1);
  });

  it('is idempotent: retrying with the same key does not create a duplicate booking', async () => {
    const flight = await createFlight();
    const agent = await loggedInAgent();
    const body = flightPayment(flight);
    const first = await agent.post('/api/payments/mock').send(body).expect(201);
    const again = await agent.post('/api/payments/mock').send(body).expect(200);
    expect(again.body.booking.bookingReference).toBe(first.body.booking.bookingReference);
    expect(await Booking.countDocuments()).toBe(1);
  });

  it('two identical requests at the same instant get the same single booking (QA-2 finding)', async () => {
    const flight = await createFlight();
    const agent = await loggedInAgent();
    const body = flightPayment(flight);
    const [a, b] = await Promise.all([agent.post('/api/payments/mock').send(body), agent.post('/api/payments/mock').send(body)]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.booking.bookingReference).toBe(b.body.booking.bookingReference);
    expect(await Booking.countDocuments()).toBe(1);
  });

  it('rejects names with digits or emoji, and over-long names, with friendly messages', async () => {
    const flight = await createFlight();
    const agent = await loggedInAgent();
    const tryName = async (firstName) => {
      const body = flightPayment(flight);
      body.booking.travellers[0].firstName = firstName;
      return (await agent.post('/api/payments/mock').send(body).expect(400)).body.error.message;
    };
    expect(await tryName('😀😀')).toMatch(/letters only/);
    expect(await tryName('R2 D2')).toMatch(/letters only/);
    expect(await tryName('A'.repeat(300))).toMatch(/at most 40 characters/);
    // Non-Latin scripts and punctuation that real names use are fine
    const ok = flightPayment(flight);
    ok.booking.travellers[0] = { ...ok.booking.travellers[0], firstName: 'प्रिया', lastName: 'D’Souza-Nair' };
    await agent.post('/api/payments/mock').send(ok).expect(201);
  });

  it('a failed payment records the attempt but creates no booking', async () => {
    const flight = await createFlight();
    const agent = await loggedInAgent();
    const res = await agent.post('/api/payments/mock').send(flightPayment(flight, { simulateFailure: true })).expect(402);
    expect(res.body.error.code).toBe('PAYMENT_FAILED');
    expect(await Booking.countDocuments()).toBe(0);
    expect(await Payment.countDocuments({ status: 'failed' })).toBe(1);
  });

  it('refuses an unavailable seat, and a seat from the other cabin', async () => {
    const flight = await createFlight();
    const agent = await loggedInAgent();
    const body = flightPayment(flight);
    body.booking.travellers[0].seat = '6A';
    expect((await agent.post('/api/payments/mock').send(body).expect(400)).body.error.code).toBe('SEAT_TAKEN');
    body.booking.travellers[0].seat = '1A'; // business row on an economy fare
    expect((await agent.post('/api/payments/mock').send(body).expect(400)).body.error.message).toMatch(/economy cabin/);
  });

  it('books hotel rooms and blocks overbooking', async () => {
    const hotel = await createHotel();
    const agent = await loggedInAgent();
    const booking = hotelBooking(hotel, { rooms: 2, adults: 3 });
    const ok = await agent.post('/api/payments/mock').send({ idempotencyKey: 'hotel-key-1', method: 'card', booking }).expect(201);
    expect(ok.body.booking.fareBreakdown.total).toBe((6000 + 720) * 2 * 2);
    expect((await Hotel.findById(hotel._id)).roomTypes[0].roomsAvailable).toBe(0);

    const res = await agent.post('/api/payments/mock').send({ idempotencyKey: 'hotel-key-2', method: 'card', booking }).expect(400);
    expect(res.body.error.code).toBe('SOLD_OUT');
  });
});

describe('my bookings & cancellation', () => {
  it('lists only my bookings and cancels with a simulated refund, releasing the seat', async () => {
    const flight = await createFlight();
    const agent = await loggedInAgent();
    const { body } = await agent.post('/api/payments/mock').send(flightPayment(flight)).expect(201);

    const other = await loggedInAgent({ email: 'other@example.com' });
    expect((await other.get('/api/bookings/me').expect(200)).body.bookings).toHaveLength(0);
    await other.patch(`/api/bookings/${body.booking._id}/cancel`).expect(404);

    const list = await agent.get('/api/bookings/me').expect(200);
    expect(list.body.bookings).toHaveLength(1);
    await agent.get(`/api/bookings/${body.booking.bookingReference}`).expect(200);

    const cancelled = await agent.patch(`/api/bookings/${body.booking._id}/cancel`).expect(200);
    expect(cancelled.body.booking.status).toBe('cancelled');
    expect(cancelled.body.booking.cancellation).toMatchObject({ by: 'traveller', feeRetained: 0 });
    // Flexi (Flexible 24h template) is free to cancel until 24h before a departure 10 days away → full refund
    expect(cancelled.body.booking.cancellation.refundAmount).toBe(body.booking.fareBreakdown.total);
    const after = await Flight.findById(flight._id);
    expect(after.seatMap.unavailableSeats).not.toContain('12A');
    expect(after.cabins.economy.sold).toBe(0);

    await agent.patch(`/api/bookings/${body.booking._id}/cancel`).expect(400);
  });

  it('a fare with no free-cancellation window refunds total minus the fee, even well before departure (QA-2 finding)', async () => {
    const flight = await createFlight();
    const agent = await loggedInAgent();
    const body = flightPayment(flight);
    body.booking.fareType = 'Saver'; // Saver template: no free window, ₹3,500 fee
    const { body: paid } = await agent.post('/api/payments/mock').send(body).expect(201);
    expect(paid.booking.policySnapshot).toMatchObject({ freeUntil: null, templateKey: 'F-SAVER', feeAfterCutoff: 3500 });
    const { body: cancelled } = await agent.patch(`/api/bookings/${paid.booking._id}/cancel`).expect(200);
    expect(cancelled.booking.cancellation.refundAmount).toBe(paid.booking.fareBreakdown.total - 3500);
    expect(cancelled.booking.cancellation.feeRetained).toBe(3500);
  });

  it('a non-refundable stay refunds nothing', async () => {
    const hotel = await createHotel();
    const agent = await loggedInAgent();
    const { body } = await pay(agent, hotelBooking(hotel, { ratePlan: 'nonrefundable' })).expect(201);
    expect(body.booking.fareBreakdown.base).toBe(5400 * 2); // ×0.9
    const { body: cancelled } = await agent.patch(`/api/bookings/${body.booking._id}/cancel`).expect(200);
    expect(cancelled.booking.cancellation.refundAmount).toBe(0);
  });

  it('refuses to cancel a trip that has already started (story #12)', async () => {
    const flight = await createFlight();
    const agent = await loggedInAgent();
    const { body } = await agent.post('/api/payments/mock').send(flightPayment(flight)).expect(201);
    await Booking.updateOne({ _id: body.booking._id }, { $set: { 'travelDates.start': new Date(Date.now() - 3600e3) } });
    const res = await agent.patch(`/api/bookings/${body.booking._id}/cancel`).expect(400);
    expect(res.body.error.code).toBe('NOT_CANCELLABLE');
  });

  it('computes refund as total minus fee after the free-cancellation cutoff', () => {
    const booking = { fareBreakdown: { total: 7000 }, policySnapshot: { freeUntil: new Date(Date.now() - 1000), feeAfterCutoff: 3500 } };
    expect(computeRefund(booking)).toBe(3500);
    booking.policySnapshot.feeAfterCutoff = 9000;
    expect(computeRefund(booking)).toBe(0);
  });

  it('still accepts adults-only parties written the Phase 1 way (person helper sanity)', () => {
    expect(person()).toEqual({ firstName: 'Priya', lastName: 'Sharma', ageCategory: 'adult' });
  });
});
