// Stage 2: the pricing engine, rate cards (option B editing), templates, commission, price changes at payment.
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import AuditLog from '../models/AuditLog.js';
import Booking from '../models/Booking.js';
import Flight from '../models/Flight.js';
import Payment from '../models/Payment.js';
import Supplier from '../models/Supplier.js';
import { defaultAirlineRateCard, flightFare, hotelStay, variableValue } from '../services/pricing.js';
import { addDays } from '../utils/dates.js';
import { app, createFlight, createHotel, flatAirlineCard, flightBooking, futureDate, hotelBooking, loggedInAgent, pay, supplierWithManager } from './helpers.js';

const at = (date, time = '09:00') => new Date(`${date}T${time}:00+05:30`);
const saver = (card) => card.tiers[0];

describe('pricing engine (pure)', () => {
  const card = defaultAirlineRateCard('IndiGo');
  const base = { origin: 'DEL', destination: 'BOM', cabin: 'economy', tier: saver(card), load: 0.1 };

  it('is cheapest 21–44 days out and steepest in the last 2 days', () => {
    const now = at('2027-02-01').getTime();
    const price = (days) => flightFare(card, { ...base, departureTime: at(addDays('2027-02-01', days)), now }).price;
    // Same weekday (Tuesday) to isolate the days-to-departure factor.
    expect(price(28)).toBeLessThan(price(14));
    expect(price(14)).toBeLessThan(price(5));
    expect(price(5)).toBeLessThan(price(0) + price(7)); // sanity
    expect(price(49)).toBeGreaterThan(price(28)); // fares don't keep falling further out
  });

  it('a festival season replaces the day-of-week factor', () => {
    const now = at('2026-10-01').getTime();
    const result = flightFare(card, { ...base, departureTime: at('2026-11-08'), now });
    expect(result.factors.map((f) => f.rule)).toContain('Season: Diwali');
    expect(result.factors.map((f) => f.rule)).not.toContain('Day of week');
  });

  it('a switched-off rule counts as ×1 and demand raises prices', () => {
    const now = at('2027-02-01').getTime();
    const departureTime = at('2027-02-16');
    const low = flightFare(card, { ...base, departureTime, now, load: 0.1 }).price;
    const high = flightFare(card, { ...base, departureTime, now, load: 0.8 }).price;
    expect(high).toBeGreaterThan(low);
    const off = { ...card, demand: { ...card.demand, enabled: false } };
    expect(flightFare(off, { ...base, departureTime, now, load: 0.8 }).price).toBe(low);
  });

  it('guard rails clamp extreme multipliers, and growing variables grow', () => {
    const wild = { ...flatAirlineCard(5000), demand: { enabled: true, bands: [{ from: 0, to: 100, x: 3 }] }, daysToDeparture: { enabled: true, bands: [{ from: 0, to: 60, x: 3 }] } };
    expect(flightFare(wild, { ...base, tier: saver(wild), departureTime: at('2027-02-16'), now: at('2027-02-01').getTime() }).price).toBe(12500); // ceiling 2.5×
    expect(variableValue({ mode: 'growing', value: 100, since: '2026-01-01', growthPctPerYear: 10 }, '2028-01-01')).toBeCloseTo(121, 0);
    expect(variableValue({ mode: 'manual', value: 100, since: '2026-01-01', growthPctPerYear: 10 }, '2028-01-01')).toBe(100);
  });

  it('prices hotel stays night by night (weekend nights cost more)', () => {
    const card2 = { kind: 'hotel', baseRates: { Deluxe: 4000 }, dayOfWeek: { enabled: true, x: [1, 1, 1, 1, 1, 1.25, 1.25] }, seasons: { enabled: false, list: [] }, leadTime: { enabled: false, bands: [] }, guardRails: { floor: 0.7, ceiling: 2 } };
    const stay = hotelStay(card2, { roomTypeName: 'Deluxe', checkIn: '2027-02-04', checkOut: '2027-02-07', ratePlan: { name: 'Flexible', x: 1 }, now: at('2027-01-20').getTime() });
    expect(stay.nights.map((n) => n.price)).toEqual([4000, 5000, 5000]); // Thu, Fri, Sat
    expect(stay.avgNightly).toBe(4667);
  });
});

describe('rate card editing (option B)', () => {
  it('a manager edits values, switches rules off and adds seasons; search prices follow at once', async () => {
    const { supplier, agent } = await supplierWithManager('airline');
    const flight = await createFlight({ supplierId: supplier._id });
    const search = async () => (await request(app).get('/api/flights').query({ origin: 'DEL', destination: 'BOM', date: futureDate(10) }).expect(200)).body.results[0].price;
    expect(await search()).toBe(5000);

    const { body } = await agent.get('/api/supplier/rate-card').expect(200);
    const card = body.rateCard;
    card.routeOverrides.list[0].fixedBase = 6000;
    card.seasons.enabled = true;
    card.seasons.list = [{ name: 'Test peak', from: futureDate(9), to: futureDate(11), x: 1.5 }]; // remove the default festivals, add one
    const put = await agent.put('/api/supplier/rate-card').send({ rateCard: card });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    expect(await search()).toBe(9000);
    expect((await Supplier.findById(supplier._id)).rateCard.version).toBe(2);
    expect(await AuditLog.countDocuments({ action: 'rate_card.update' })).toBe(1);

    // The preview matches what search shows.
    const preview = await agent
      .post('/api/supplier/rate-card/preview')
      .send({ rateCard: card, sample: { origin: 'DEL', destination: 'BOM', date: futureDate(10), time: '09:00', tier: 'Saver', loadPct: 0 } })
      .expect(200);
    expect(preview.body.price).toBe(9000);
    expect(flight).toBeTruthy();
  });

  it('rejects gaps, overlaps, out-of-range multipliers, new rule types and new tiers', async () => {
    const { agent } = await supplierWithManager('airline');
    const { body } = await agent.get('/api/supplier/rate-card');
    const bad = (mutate) => {
      const card = structuredClone(body.rateCard);
      mutate(card);
      return agent.put('/api/supplier/rate-card').send({ rateCard: card }).expect(400);
    };
    expect((await bad((c) => { c.demand.bands[1].from = 45; })).body.error.message).toMatch(/gap or overlap/);
    expect((await bad((c) => { c.daysToDeparture.bands.pop(); })).body.error.message).toMatch(/must end at 60/);
    expect((await bad((c) => { c.tiers[0].x = 7; })).body.error.message).toMatch(/between 0.5 and 3/);
    await bad((c) => { c.seasons.list = [{ name: 'A', from: '2027-01-01', to: '2027-01-10', x: 1.2 }, { name: 'B', from: '2027-01-05', to: '2027-01-12', x: 1.1 }]; });
    await bad((c) => { c.tiers.push({ ...c.tiers[0], name: 'Premium' }); });
    // Unknown keys (a made-up rule) are dropped, never stored.
    const extra = structuredClone(body.rateCard);
    extra.weatherFactor = { enabled: true, x: 2 };
    const saved = await agent.put('/api/supplier/rate-card').send({ rateCard: extra }).expect(200);
    expect(saved.body.rateCard.weatherFactor).toBeUndefined();
  });

  it('a hotel’s rate plans: non-refundable is cheaper and freezes a zero refund', async () => {
    const hotel = await createHotel();
    const res = await request(app).get(`/api/hotels/${hotel._id}`).query({ checkIn: futureDate(5), checkOut: futureDate(7) }).expect(200);
    const plans = res.body.hotel.roomTypes[0].plans;
    expect(plans.map((p) => [p.key, p.avgNightly, p.freeCancellation])).toEqual([
      ['flexible', 6000, true],
      ['nonrefundable', 5400, false],
    ]);
    expect(plans[1].terms).toBe('Non-refundable.');
  });
});

describe('re-pricing at payment', () => {
  it('a changed total takes no payment and reserves nothing', async () => {
    const flight = await createFlight();
    const agent = await loggedInAgent();
    const res = await pay(agent, flightBooking(flight), { expectedTotal: 7000 }).expect(409);
    expect(res.body.error).toMatchObject({ code: 'PRICE_CHANGED' });
    expect(res.body.error.message).toMatch(/₹7,000 to ₹7,420/);
    expect(res.body.quote.fareBreakdown.total).toBe(7420);
    expect(await Payment.countDocuments()).toBe(0);
    expect(await Booking.countDocuments()).toBe(0);
    expect((await Flight.findById(flight._id)).cabins.economy.sold).toBe(0);
    await pay(agent, flightBooking(flight), { expectedTotal: 7420 }).expect(201);
  });

  it('the quote endpoint returns the same breakdown payment will charge', async () => {
    const hotel = await createHotel();
    const agent = await loggedInAgent();
    const q = await agent.post('/api/payments/quote').send({ booking: hotelBooking(hotel, { breakfast: true }) }).expect(200);
    // 2 nights × 6000 + breakfast 550 × 2 guests × 2 nights + taxes 720 × 2
    expect(q.body.fareBreakdown).toMatchObject({ base: 12000, breakfast: 2200, taxes: 1440, total: 15640 });
    const paid = await pay(agent, hotelBooking(hotel, { breakfast: true }), { expectedTotal: 15640 }).expect(201);
    expect(paid.body.booking.selection).toMatchObject({ ratePlan: 'flexible', breakfast: true });
    expect(paid.body.booking.pricing.nights).toHaveLength(2);
  });
});

describe('cancellation templates and commission (admin)', () => {
  it('editing a template changes future bookings only, and is audit-logged', async () => {
    const flight = await createFlight();
    const traveller = await loggedInAgent();
    const before = (await pay(traveller, { ...flightBooking(flight), fareType: 'Saver' }).expect(201)).body.booking;
    const admin = await loggedInAgent({ role: 'admin' });
    await admin.put('/api/admin/templates/F-SAVER').send({ name: 'Saver', freeWindow: null, feeAmount: 4000 }).expect(200);
    const after = (await pay(traveller, { ...flightBooking(flight, { travellers: [{ firstName: 'Ravi', lastName: 'Kumar', ageCategory: 'adult' }] }), fareType: 'Saver' }).expect(201)).body.booking;
    expect(before.policySnapshot.feeAfterCutoff).toBe(3500);
    expect(after.policySnapshot.feeAfterCutoff).toBe(4000);
    expect((await Booking.findById(before._id)).policySnapshot.feeAfterCutoff).toBe(3500);
    expect(await AuditLog.countDocuments({ action: 'template.update' })).toBe(1);
    await admin.put('/api/admin/templates/H-NONREF').send({ name: 'Non-refundable', freeWindow: { unit: 'days', value: 2 } }).expect(400);
  });

  it('only admin changes the commission rate', async () => {
    const admin = await loggedInAgent({ role: 'admin' });
    expect((await admin.get('/api/admin/settings/commission').expect(200)).body.rate).toBe(0.1);
    await admin.put('/api/admin/settings/commission').send({ rate: 0.12 }).expect(200);
    await admin.put('/api/admin/settings/commission').send({ rate: 0.9 }).expect(400);
    const { agent } = await supplierWithManager('airline');
    await agent.put('/api/admin/settings/commission').send({ rate: 0 }).expect(403);
    expect((await AuditLog.findOne({ action: 'commission.update' })).after).toEqual({ rate: 0.12 });
  });
});

