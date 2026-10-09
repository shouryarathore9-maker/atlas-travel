// Stage 5: offers — browsing, applying, stacking rules, caps, taxes, first-3, redemption races,
// restore rules, supplier scoping, the admin kill switch and expiry.
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import AuditLog from '../models/AuditLog.js';
import Booking from '../models/Booking.js';
import Notification from '../models/Notification.js';
import Offer from '../models/Offer.js';
import { expireOffers } from '../services/offers.js';
import { addDays, todayIstString } from '../utils/dates.js';
import { app, createFlight, createHotel, flightBooking, hotelBooking, loggedInAgent, pay, person, supplierWithManager } from './helpers.js';

const today = todayIstString();
let n = 0;
const offer = (o) =>
  Offer.create({
    slug: `offer-${++n}`,
    title: `Offer ${n}`,
    summary: 'A test offer',
    funder: 'platform',
    scope: 'both',
    discountType: 'percent',
    value: 10,
    maxDiscount: 1000,
    validFrom: addDays(today, -1),
    validTo: addDays(today, 10),
    ...o,
  });
const quote = (agent, booking, offerCode) => agent.post('/api/payments/quote').send({ booking, offerCode }).expect(200);

describe('browsing offers (workflow 19)', () => {
  it('lists active offers only; an ended offer’s page says so and hides the code', async () => {
    await offer({ code: 'LIVE10' });
    await offer({ code: 'PAUSED10', status: 'paused' });
    const old = await offer({ code: 'OLD10', validFrom: addDays(today, -30), validTo: addDays(today, -2) });
    await offer({ code: 'SOON10', validFrom: addDays(today, 3) });
    const list = await request(app).get('/api/offers').expect(200);
    expect(list.body.offers.map((o) => o.code)).toEqual(['LIVE10']);
    expect(list.body.offers[0].terms.join(' ')).toMatch(/One offer per booking/);
    const page = await request(app).get(`/api/offers/${old.slug}`).expect(200);
    expect(page.body.offer).toMatchObject({ live: false, code: null });
  });
});

describe('applying an offer (workflow 20)', () => {
  it('a valid code discounts only the base fare; flight tax is recomputed on the discounted base', async () => {
    await offer({ code: 'SAVE10' });
    const flight = await createFlight();
    const agent = await loggedInAgent();
    const q = await quote(agent, flightBooking(flight), 'save10');
    // Flexi 6000 → 10% = 600 off; seat 350 + meal 350 untouched; tax 12% of 5400
    expect(q.body.fareBreakdown).toMatchObject({ base: 6000, discounts: 600, addons: 700, taxes: 648, total: 6748 });
    expect(q.body.offer).toMatchObject({ code: 'SAVE10', how: 'code', amount: 600 });
    const paid = await pay(agent, flightBooking(flight), { offerCode: 'SAVE10', expectedTotal: 6748 }).expect(201);
    expect(paid.body.booking.offer).toMatchObject({ code: 'SAVE10', amount: 600, funder: 'platform' });
    expect((await Offer.findOne({ code: 'SAVE10' })).redemptions).toBe(1);
  });

  it('hotel tax is fixed per night, so a discount doesn’t shrink it; caps and minimum spend apply', async () => {
    await offer({ code: 'BIGCAP', value: 50, maxDiscount: 2000 });
    await offer({ code: 'MIN50K', minSpend: 50000 });
    const hotel = await createHotel();
    const agent = await loggedInAgent();
    const q = await quote(agent, hotelBooking(hotel), 'BIGCAP');
    expect(q.body.fareBreakdown).toMatchObject({ base: 12000, discounts: 2000, taxes: 1440, total: 11440 });
    expect((await quote(agent, hotelBooking(hotel), 'MIN50K')).body.codeError).toMatch(/Spend at least ₹50,000/);
  });

  it('gives plain reasons for codes that can’t be used', async () => {
    await offer({ code: 'HOTELSONLY', scope: 'hotels' });
    await offer({ code: 'PAUSEDCODE', status: 'paused' });
    await offer({ code: 'ENDED', validTo: addDays(today, -1), validFrom: addDays(today, -5) });
    const flight = await createFlight();
    const agent = await loggedInAgent();
    const reason = async (code) => (await quote(agent, flightBooking(flight), code)).body.codeError;
    expect(await reason('NOPE')).toMatch(/don’t recognise/);
    expect(await reason('HOTELSONLY')).toMatch(/for hotels/);
    expect(await reason('PAUSEDCODE')).toMatch(/paused/);
    expect(await reason('ENDED')).toMatch(/ended/);
  });

  it('one offer per booking: the bigger automatic offer applies, and a typed code replaces it', async () => {
    const { supplier } = await supplierWithManager('airline');
    await offer({ auto: true, code: null, value: 5, title: 'Small auto' });
    await offer({ auto: true, code: null, funder: 'supplier', supplierId: supplier._id, supplierName: 'IndiGo', scope: 'flights', value: 8, title: 'IndiGo auto' });
    await offer({ code: 'TYPED', discountType: 'flat', value: 100, maxDiscount: null });
    const flight = await createFlight({ supplierId: supplier._id });
    const agent = await loggedInAgent();
    expect((await quote(agent, flightBooking(flight))).body.offer).toMatchObject({ title: 'IndiGo auto', how: 'auto', amount: 480 });
    expect((await quote(agent, flightBooking(flight), 'TYPED')).body.offer).toMatchObject({ code: 'TYPED', how: 'code', amount: 100 });
    // A supplier's offer never applies to another supplier's items.
    const other = await createFlight();
    expect((await quote(agent, flightBooking(other))).body.offer.title).toBe('Small auto');
  });

  it('first-3-bookings offers stop after three paid bookings; supplier-cancelled ones don’t count', async () => {
    await offer({ code: 'FIRST3', firstBookingsOnly: true, discountType: 'flat', value: 100, maxDiscount: null });
    const hotel = await createHotel({ roomTypes: [{ name: 'Deluxe Room', occupancy: { adults: 2, children: 1 }, taxesAndFees: 720, roomsTotal: 20 }] });
    const agent = await loggedInAgent();
    const bookings = [];
    for (let i = 0; i < 3; i++) bookings.push((await pay(agent, hotelBooking(hotel, { checkIn: addDays(today, 5 + i), checkOut: addDays(today, 6 + i) }), { offerCode: 'FIRST3' }).expect(201)).body.booking);
    expect((await quote(agent, hotelBooking(hotel), 'FIRST3')).body.codeError).toMatch(/first 3 bookings/);
    await Booking.updateOne({ _id: bookings[0]._id }, { $set: { status: 'cancelled', 'cancellation.by': 'supplier' } });
    expect((await quote(agent, hotelBooking(hotel), 'FIRST3')).body.offer.code).toBe('FIRST3');
  });

  it('two travellers race for the last redemption: exactly one gets it, the other is told before paying', async () => {
    await offer({ code: 'LASTONE', redemptionLimit: 1, discountType: 'flat', value: 300, maxDiscount: null });
    const flight = await createFlight();
    const a = await loggedInAgent();
    const b = await loggedInAgent();
    const expected = (await quote(a, flightBooking(flight, { travellers: [person('Asha', 'Rao')] }), 'LASTONE')).body.fareBreakdown.total;
    const [ra, rb] = await Promise.all([
      pay(a, flightBooking(flight, { travellers: [person('Asha', 'Rao')] }), { offerCode: 'LASTONE', expectedTotal: expected }),
      pay(b, flightBooking(flight, { travellers: [person('Ravi', 'Das')] }), { offerCode: 'LASTONE', expectedTotal: expected }),
    ]);
    expect([ra.status, rb.status].sort()).toEqual([201, 409]);
    const loser = ra.status === 409 ? ra : rb;
    expect(loser.body.error.code).toBe('PRICE_CHANGED');
    expect(await Booking.countDocuments()).toBe(1);
    const last = await Offer.findOne({ code: 'LASTONE' });
    expect(last).toMatchObject({ redemptions: 1, status: 'exhausted' });
  });

  it('a traveller cancellation keeps the redemption used; a supplier cancellation gives it back', async () => {
    await offer({ code: 'KEEP', discountType: 'flat', value: 200, maxDiscount: null });
    const { supplier, agent: manager } = await supplierWithManager('hotel');
    const agent = await loggedInAgent();
    const one = (await pay(agent, hotelBooking({ _id: supplier.hotelId }), { offerCode: 'KEEP' }).expect(201)).body.booking;
    const two = (await pay(agent, hotelBooking({ _id: supplier.hotelId }, { checkIn: addDays(today, 8), checkOut: addDays(today, 9) }), { offerCode: 'KEEP' }).expect(201)).body.booking;
    await agent.patch(`/api/bookings/${one._id}/cancel`).expect(200);
    expect((await Offer.findOne({ code: 'KEEP' })).redemptions).toBe(2);
    await manager.post(`/api/supplier/reservations/${two._id}/cancel`).send({ reason: 'Renovation work' }).expect(200);
    expect((await Offer.findOne({ code: 'KEEP' })).redemptions).toBe(1);
    expect((await Booking.findById(two._id)).cancellation.refundAmount).toBe(two.fareBreakdown.total); // the amount actually paid
  });
});

describe('managing offers (workflow 18)', () => {
  const body = (o = {}) => ({
    title: 'Monsoon stays',
    summary: '15% off',
    image: '/images/seed/offers/gift.jpg',
    auto: false,
    code: 'MONSOON15',
    scope: 'hotels',
    discountType: 'percent',
    value: 15,
    maxDiscount: 3000,
    minSpend: 0,
    validFrom: today,
    validTo: addDays(today, 30),
    redemptionLimit: null,
    firstBookingsOnly: false,
    ...o,
  });

  it('suppliers create offers for their own items only and can’t touch others’', async () => {
    const { agent: hotelA } = await supplierWithManager('hotel');
    const { agent: hotelB } = await supplierWithManager('hotel', { name: 'Hotel B' });
    await hotelA.post('/api/supplier/offers').send(body({ scope: 'flights' })).expect(400);
    const created = (await hotelA.post('/api/supplier/offers').send(body()).expect(201)).body.offer;
    expect(created).toMatchObject({ funder: 'supplier', supplierName: 'Test Courtyard' });
    await hotelB.put(`/api/supplier/offers/${created._id}`).send(body()).expect(404);
    await hotelB.post(`/api/supplier/offers/${created._id}/pause`).expect(404);
    expect((await hotelB.get('/api/supplier/offers').expect(200)).body.total).toBe(0);
    await hotelA.post('/api/supplier/offers').send(body({ title: 'Clash' })).expect(409); // code in use
  });

  it('admin creates platform offers and can pause any offer (kill switch, audited)', async () => {
    const { agent: hotel } = await supplierWithManager('hotel');
    const supplierOffer = (await hotel.post('/api/supplier/offers').send(body()).expect(201)).body.offer;
    const admin = await loggedInAgent({ role: 'admin' });
    await admin.post('/api/admin/offers').send(body({ code: 'ATLAS5', scope: 'both', value: 5, maxDiscount: 500 })).expect(201);
    await admin.put(`/api/admin/offers/${supplierOffer._id}`).send(body()).expect(404); // admin edits only platform offers
    await admin.post(`/api/admin/offers/${supplierOffer._id}/pause`).expect(200);
    expect((await Offer.findById(supplierOffer._id)).status).toBe('paused');
    expect(await AuditLog.countDocuments({ action: 'offer.kill_switch' })).toBe(1);
    await admin.post(`/api/admin/offers/${supplierOffer._id}/resume`).expect(200);
    expect((await Offer.findById(supplierOffer._id)).status).toBe('active');
    await hotel.post('/api/admin/offers').send(body()).expect(403);
  });

  it('the daily job expires ended offers and tells their creators once', async () => {
    const { supplier } = await supplierWithManager('hotel');
    await offer({ code: 'GONE', funder: 'supplier', supplierId: supplier._id, supplierName: 'Test Courtyard', validFrom: addDays(today, -10), validTo: addDays(today, -1) });
    expect(await expireOffers()).toBe(1);
    expect(await expireOffers()).toBe(0);
    expect((await Offer.findOne({ code: 'GONE' })).status).toBe('expired');
    expect(await Notification.countDocuments({ type: 'offer.expired' })).toBe(1);
  });
});
