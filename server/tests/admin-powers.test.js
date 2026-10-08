// Admin powers: suspending/reactivating a supplier and the platform-wide pricing limits.
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import AuditLog from '../models/AuditLog.js';
import Booking from '../models/Booking.js';
import Offer from '../models/Offer.js';
import User from '../models/User.js';
import { DEFAULT_PRICING_LIMITS, flightFare, hotelStay } from '../services/pricing.js';
import { app, createFlight, createHotel, flatAirlineCard, flightBooking, futureDate, hotelBooking, loggedInAgent, PASSWORD, pay, supplierWithManager, testAirline } from './helpers.js';

const searchFlights = async () => (await request(app).get('/api/flights').query({ origin: 'DEL', destination: 'BOM', date: futureDate(10) }).expect(200)).body.results;
const searchHotels = async () => (await request(app).get('/api/hotels').query({ city: 'Delhi', checkIn: futureDate(5), checkOut: futureDate(7) }).expect(200)).body.results;

describe('suspend and reactivate a supplier', () => {
  it('hides inventory, blocks bookings and the manager’s sign-in, keeps existing bookings, and is audit-logged', async () => {
    const { supplier, agent: manager } = await supplierWithManager('airline');
    const flight = await createFlight({ supplierId: supplier._id });
    const traveller = await loggedInAgent();
    const paid = await pay(traveller, flightBooking(flight));
    expect(paid.status, JSON.stringify(paid.body)).toBe(201);
    await Offer.create({
      slug: 'test-airline-offer', title: 'Airline offer', summary: 'x', image: '/images/seed/offers/gift.jpg', funder: 'supplier', supplierId: supplier._id,
      code: 'AIRTEST', scope: 'flights', discountType: 'flat', value: 100, validFrom: futureDate(-1), validTo: futureDate(30), status: 'active',
    });
    expect(await searchFlights()).toHaveLength(1);

    const admin = await loggedInAgent({ role: 'admin' });
    await admin.post(`/api/admin/suppliers/${supplier._id}/suspend`).send({ reason: 'no' }).expect(400); // reason too short
    const res = await admin.post(`/api/admin/suppliers/${supplier._id}/suspend`).send({ reason: 'Repeated schedule failures' }).expect(200);
    expect(res.body.supplier.status).toBe('suspended');
    await admin.post(`/api/admin/suppliers/${supplier._id}/suspend`).send({ reason: 'Again, twice' }).expect(409);

    // Hidden from search and detail; can't be quoted or paid for; its offers leave the public list.
    expect(await searchFlights()).toHaveLength(0);
    await request(app).get(`/api/flights/${flight._id}`).expect(404);
    const quote = await traveller.post('/api/payments/quote').send({ booking: flightBooking(flight, { travellers: [{ firstName: 'A', lastName: 'B', ageCategory: 'adult' }] }) });
    expect(quote.status).toBe(409);
    expect(quote.body.error.code).toBe('NOT_ON_SALE');
    const offers = (await request(app).get('/api/offers').expect(200)).body.offers;
    expect(offers.map((o) => o.slug)).not.toContain('test-airline-offer');

    // The manager's open session and any new sign-in are refused.
    const blocked = await manager.get('/api/supplier/overview').expect(403);
    expect(blocked.body.error.code).toBe('SUPPLIER_SUSPENDED');
    const email = (await User.findOne({ supplierId: supplier._id })).email;
    const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD }).expect(403);
    expect(login.body.error.code).toBe('SUPPLIER_SUSPENDED');
    await request(app).post('/api/auth/login').send({ email, password: 'Wrong1234' }).expect(401); // wrong password says nothing more

    // Existing bookings are untouched and still visible to the traveller.
    const booking = await Booking.findOne({ supplierId: supplier._id });
    expect(booking.status).toBe('confirmed');
    expect((await traveller.get('/api/bookings/me').expect(200)).body.bookings).toHaveLength(1);

    // Admin's supplier list shows the status, reason and upcoming bookings.
    const list = (await admin.get('/api/admin/suppliers').expect(200)).body.suppliers.find((s) => String(s._id) === String(supplier._id));
    expect(list).toMatchObject({ status: 'suspended', upcomingBookings: 1 });
    expect(list.suspension.reason).toBe('Repeated schedule failures');

    // Reactivate: everything comes back.
    await admin.post(`/api/admin/suppliers/${supplier._id}/reactivate`).expect(200);
    expect(await searchFlights()).toHaveLength(1);
    await request(app).post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);

    const entries = await AuditLog.find({ action: /^supplier\./ }).sort({ at: 1 }).lean();
    expect(entries.map((e) => e.action)).toEqual(['supplier.suspend', 'supplier.reactivate']);
    expect(String(entries[0].supplierId)).toBe(String(supplier._id));
  });

  it('hides a suspended hotel from search and the featured list; only admins can suspend', async () => {
    const hotel = await createHotel({ starRating: 5, rating: { average: 4.8, count: 20 } });
    expect(await searchHotels()).toHaveLength(1);
    const manager = await loggedInAgent({ role: 'hotel_manager', supplierId: hotel.supplierId });
    await manager.post(`/api/admin/suppliers/${hotel.supplierId}/suspend`).send({ reason: 'Trying it myself' }).expect(403);
    await request(app).post(`/api/admin/suppliers/${hotel.supplierId}/suspend`).send({ reason: 'Not signed in' }).expect(401);

    const admin = await loggedInAgent({ role: 'admin' });
    await admin.post(`/api/admin/suppliers/${hotel.supplierId}/suspend`).send({ reason: 'Health inspection pending' }).expect(200);
    expect(await searchHotels()).toHaveLength(0);
    expect((await request(app).get('/api/hotels/featured').expect(200)).body.results).toHaveLength(0);
    await request(app).get(`/api/hotels/${hotel._id}`).expect(404);
    const quote = await (await loggedInAgent()).post('/api/payments/quote').send({ booking: hotelBooking(hotel) });
    expect(quote.body.error.code).toBe('NOT_ON_SALE');
  });
});

describe('platform pricing limits', () => {
  const at = (date, time = '09:00') => new Date(`${date}T${time}:00+05:30`);

  it('the engine caps every multiplier and keeps fares inside the bounds', () => {
    const card = flatAirlineCard(5000);
    const tier = card.tiers[0];
    const base = { origin: 'DEL', destination: 'BOM', cabin: 'economy', departureTime: at('2027-02-16'), now: at('2027-02-01').getTime() };
    // ×2.8 on the tier is capped at ×2 (the default ceiling): 5000 × 2 = 10,000, not 14,000.
    const capped = flightFare(card, { ...base, tier: { ...tier, x: 2.8 } });
    expect(capped.price).toBe(10000);
    expect(capped.factors.find((f) => f.capped)).toBeTruthy();
    // A ₹1 fixed base can't produce a ₹1 fare, and a huge one is held at the maximum.
    const tiny = flatAirlineCard(1);
    expect(flightFare(tiny, { ...base, tier: tiny.tiers[0] })).toMatchObject({ price: DEFAULT_PRICING_LIMITS.flightFare.min, limited: 'min' });
    const huge = flatAirlineCard(100000);
    expect(flightFare(huge, { ...base, tier: huge.tiers[0] }).price).toBe(DEFAULT_PRICING_LIMITS.flightFare.max);
    // Tighter limits passed in apply at once.
    expect(flightFare(card, { ...base, tier, limits: { ...DEFAULT_PRICING_LIMITS, flightFare: { min: 1000, max: 4000 } } }).price).toBe(4000);

    const hotelCard = { kind: 'hotel', baseRates: { Deluxe: 200 }, dayOfWeek: { enabled: false, x: [] }, seasons: { enabled: false, list: [] }, leadTime: { enabled: false, bands: [] }, guardRails: { floor: 0.7, ceiling: 2 } };
    const stay = hotelStay(hotelCard, { roomTypeName: 'Deluxe', checkIn: '2027-02-04', checkOut: '2027-02-05', ratePlan: { name: 'Flexible', x: 1 }, now: at('2027-01-20').getTime() });
    expect(stay.nights[0]).toMatchObject({ price: 500, limited: 'min' });
  });

  it('a rate card above the limits can’t be saved; admin can change the limits (validated, audit-logged)', async () => {
    const { agent } = await supplierWithManager('airline');
    const { body } = await agent.get('/api/supplier/rate-card').expect(200);
    expect(body.limits).toEqual(DEFAULT_PRICING_LIMITS);

    const card = structuredClone(body.rateCard);
    card.demand.bands[2].x = 2.4; // allowed by the card's own rules (≤ 3), not by the platform (≤ 2)
    const rejected = await agent.put('/api/supplier/rate-card').send({ rateCard: card }).expect(400);
    expect(rejected.body.error.message).toMatch(/up to ×2/);
    expect(rejected.body.error.details[0].path).toBe('demand.bands.2.x');

    const typo = structuredClone(body.rateCard);
    typo.base.perKm.value = 340; // meant 3.40
    expect((await agent.put('/api/supplier/rate-card').send({ rateCard: typo }).expect(400)).body.error.message).toMatch(/highest allowed fare/);

    const admin = await loggedInAgent({ role: 'admin' });
    await admin.put('/api/admin/settings/pricing-limits').send({ ...DEFAULT_PRICING_LIMITS, maxMultiplier: 4 }).expect(400);
    await admin.put('/api/admin/settings/pricing-limits').send({ ...DEFAULT_PRICING_LIMITS, flightFare: { min: 5000, max: 5000 } }).expect(400);
    await agent.put('/api/admin/settings/pricing-limits').send({ ...DEFAULT_PRICING_LIMITS, maxMultiplier: 2.5 }).expect(403);
    await admin.put('/api/admin/settings/pricing-limits').send({ ...DEFAULT_PRICING_LIMITS, maxMultiplier: 2.5 }).expect(200);
    expect((await admin.get('/api/admin/settings/pricing-limits').expect(200)).body.limits.maxMultiplier).toBe(2.5);
    await agent.put('/api/supplier/rate-card').send({ rateCard: card }).expect(200);
    expect(await AuditLog.countDocuments({ action: 'pricing_limits.update' })).toBe(1);
  });

  it('raising the fare floor changes search prices straight away', async () => {
    const airline = await testAirline({ rateCard: flatAirlineCard(1500) });
    await createFlight({ supplierId: airline._id });
    expect((await searchFlights())[0].price).toBe(1500);
    const admin = await loggedInAgent({ role: 'admin' });
    await admin.put('/api/admin/settings/pricing-limits').send({ ...DEFAULT_PRICING_LIMITS, flightFare: { min: 6000, max: 20000 } }).expect(400); // floor at most ₹5,000
    await admin.put('/api/admin/settings/pricing-limits').send({ ...DEFAULT_PRICING_LIMITS, flightFare: { min: 2000, max: 20000 } }).expect(200);
    expect((await searchFlights())[0].price).toBe(2000);
  });
});
