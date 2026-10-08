// Stage 3: passengers, cabin meals and seats, saved travellers, special requests, documents and check-in.
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import AuditLog from '../models/AuditLog.js';
import Flight from '../models/Flight.js';
import { verifyQr } from '../services/travelDocs.js';
import { app, createFlight, flightBooking, futureDate, loggedInAgent, pay, person, supplierWithManager, testAirline } from './helpers.js';

const travellers = (...list) => list;
const withParty = (flight, list, extra = {}) => flightBooking(flight, { fareType: 'Saver', travellers: list, ...extra });

describe('passenger rules (workflow 17)', () => {
  it('rejects more infants than adults, children without an adult, and duplicate names', async () => {
    const flight = await createFlight();
    const agent = await loggedInAgent();
    const err = async (list) => (await pay(agent, withParty(flight, list)).expect(400)).body.error;
    expect((await err(travellers(person('Asha', 'Rao'), person('Baby', 'Rao', 'infant'), person('Tiny', 'Rao', 'infant')))).message).toMatch(/Each infant needs an adult/);
    expect((await err(travellers(person('Kid', 'Rao', 'child')))).message).toMatch(/at least one adult/);
    const dup = await err(travellers(person('Ravi', 'Kumar'), person(' ravi ', ' KUMAR ')));
    expect(dup).toMatchObject({ code: 'DUPLICATE_NAMES' });
    expect(dup.message).toMatch(/middle name or suffix/);
    await pay(agent, withParty(flight, travellers(person('Ravi', 'Kumar'), person('Ravi', 'Kumar Jr.')))).expect(201);
  });

  it('infants pay a flat ₹1,500, untaxed, take no seat and need no meal; children pay the full fare', async () => {
    const flight = await createFlight();
    const agent = await loggedInAgent();
    const res = await pay(agent, withParty(flight, travellers(person('Asha', 'Rao'), person('Kid', 'Rao', 'child'), person('Baby', 'Rao', 'infant')))).expect(201);
    expect(res.body.booking.fareBreakdown).toMatchObject({ base: 10000, infantFees: 1500, taxes: 1200, total: 12700 });
    expect((await Flight.findById(flight._id)).cabins.economy.sold).toBe(2);
    await pay(agent, withParty(flight, travellers(person('Asha', 'Rao'), { ...person('Baby', 'Rao', 'infant'), seat: '20B' }))).expect(400);
  });
});

describe('cabins: meals and seats (workflows 15–16)', () => {
  it('uses the airline’s own menu per cabin, or the platform default; business seats are free', async () => {
    const airline = await testAirline({ policies: { mealsByCabin: { economy: [{ name: 'Idli sambar', price: 200, isVeg: true }], business: null } } });
    const flight = await createFlight({ supplierId: airline._id });
    const agent = await loggedInAgent();
    const detail = await request(app).get(`/api/flights/${flight._id}`).query({ cabin: 'business' }).expect(200);
    expect(detail.body.meals.every((m) => m.price === 0)).toBe(true); // complimentary default
    expect(detail.body.seatMap.rows).toEqual([1, 2, 3, 4]);
    expect(detail.body.tiers.map((t) => t.name)).toEqual(['Business']);
    const eco = await request(app).get(`/api/flights/${flight._id}`).query({ cabin: 'economy' }).expect(200);
    expect(eco.body.meals.map((m) => m.name)).toEqual(['Idli sambar']);
    expect(eco.body.seatMap.unavailableSeats).toEqual(['6A']);

    await pay(agent, flightBooking(flight, { travellers: [{ ...person(), seat: '12A', meal: 'Vegetable biryani' }] })).expect(400); // not on this menu
    const biz = await pay(agent, flightBooking(flight, { fareType: 'Business', travellers: [{ ...person(), seat: '1A', meal: 'Chef’s vegetarian thali' }] })).expect(201);
    expect(biz.body.booking.fareBreakdown).toMatchObject({ base: 15000, seatCharges: 0, mealCharges: 0 });
  });

  it('an aircraft without a business cabin offers no business fares', async () => {
    const flight = await createFlight({ aircraftConfig: 'A320neo-1', cabins: { economy: { capacity: 186, sold: 0 }, business: null } });
    const res = await request(app).get(`/api/flights/${flight._id}`).query({ cabin: 'business' }).expect(200);
    expect(res.body.tiers).toEqual([]);
    const search = await request(app).get('/api/flights').query({ origin: 'DEL', destination: 'BOM', date: futureDate(10), cabin: 'business' }).expect(200);
    expect(search.body.total).toBe(0);
  });
});

describe('saved travellers (workflow 30)', () => {
  it('adds, edits and deletes, refuses duplicates, and saves new travellers after payment', async () => {
    const agent = await loggedInAgent();
    const { body } = await agent.post('/api/me/travellers').send(person('Meera', 'Iyer')).expect(201);
    await agent.post('/api/me/travellers').send(person('meera', ' iyer')).expect(409);
    const id = body.travellers[0]._id;
    await agent.put(`/api/me/travellers/${id}`).send(person('Meera', 'Iyer', 'child')).expect(200);
    const flight = await createFlight();
    await pay(agent, withParty(flight, travellers(person('Arun', 'Iyer'), person('Meera', 'Iyer', 'child'))), { saveTravellers: true }).expect(201);
    const list = (await agent.get('/api/me/travellers').expect(200)).body.travellers;
    expect(list.map((t) => `${t.firstName} ${t.lastName}`)).toEqual(['Meera Iyer', 'Arun Iyer']);
    await agent.delete(`/api/me/travellers/${id}`).expect(200);
    expect((await agent.get('/api/me/travellers')).body.travellers).toHaveLength(1);
  });
});

describe('saved travellers: double-tap', () => {
  it('two identical adds at the same moment save one traveller', async () => {
    const agent = await loggedInAgent();
    const body = { firstName: 'Meera', lastName: 'Iyer', ageCategory: 'adult' };
    const results = await Promise.all([1, 2, 3].map(() => agent.post('/api/me/travellers').send(body)));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect((await agent.get('/api/me/travellers').expect(200)).body.travellers).toHaveLength(1);
  });

  it('a double-sent message or offer is stored once; a deliberate repeat later still goes through', async () => {
    const { agent } = await supplierWithManager('airline');
    const offer = { title: 'Monsoon deal', summary: '5% off', description: '', image: '/images/seed/offers/gift.jpg', auto: false, code: 'MONSOON5', scope: 'flights', discountType: 'percent', value: 5, maxDiscount: 500, minSpend: 0, redemptionLimit: null, firstBookingsOnly: false, validFrom: futureDate(0), validTo: futureDate(20) };
    const created = await Promise.all([1, 2].map(() => agent.post('/api/supplier/offers').send(offer)));
    expect(created.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(created.find((r) => r.status === 409).body.error.code).toBe('DUPLICATE_SUBMIT');

    const RequestOnce = (await import('mongoose')).default.model('RequestOnce');
    await RequestOnce.updateMany({}, { $set: { at: new Date(Date.now() - 60e3) } }); // the window has passed
    const again = await agent.post('/api/supplier/offers').send(offer);
    expect(again.body.error?.code).not.toBe('DUPLICATE_SUBMIT'); // reaches the handler (code already taken → its own error)
  });
});

describe('special requests (workflow 4)', () => {
  it('the supplier answers once, the traveller is told, admin can read it, other suppliers can’t', async () => {
    const { supplier, agent: manager } = await supplierWithManager('airline');
    const flight = await createFlight({ supplierId: supplier._id });
    const traveller = await loggedInAgent();
    const { booking } = (await pay(traveller, flightBooking(flight, { specialRequest: 'Wheelchair at arrival, please' })).expect(201)).body;

    const open = await manager.get('/api/supplier/special-requests').expect(200);
    expect(open.body.items.map((i) => i.specialRequest.text)).toEqual(['Wheelchair at arrival, please']);
    const { agent: other } = await supplierWithManager('airline', { name: 'SpiceJet', code: 'SG' });
    await other.post(`/api/supplier/special-requests/${booking._id}/reply`).send({ status: 'accepted' }).expect(404);

    await manager.post(`/api/supplier/special-requests/${booking._id}/reply`).send({ status: 'accepted', comment: 'Arranged at gate 4.' }).expect(200);
    await manager.post(`/api/supplier/special-requests/${booking._id}/reply`).send({ status: 'cannot' }).expect(409);
    const notes = (await traveller.get('/api/notifications')).body.notifications.map((n) => n.title);
    expect(notes.some((t) => /accepted your request/.test(t))).toBe(true);
    expect(await AuditLog.countDocuments({ action: 'special_request.reply' })).toBe(1);
    const admin = await loggedInAgent({ role: 'admin' });
    expect((await admin.get('/api/admin/special-requests').expect(200)).body.items[0].specialRequest.reply.status).toBe('accepted');
  });
});

describe('e-ticket and web check-in (workflows 22–23)', () => {
  const soon = (hours) => ({ departureTime: new Date(Date.now() + hours * 3600e3), arrivalTime: new Date(Date.now() + (hours + 2) * 3600e3) });

  it('documents carry a signed QR with no personal data', async () => {
    const flight = await createFlight();
    const agent = await loggedInAgent();
    const { booking } = (await pay(agent, flightBooking(flight)).expect(201)).body;
    const docs = await agent.get(`/api/bookings/${booking.bookingReference}/documents`).expect(200);
    expect(docs.body.qr).toMatch(new RegExp(`^ATLAS1\\.${booking.bookingReference}\\.0\\.`));
    expect(docs.body.qr).not.toMatch(/Priya|Sharma|@/);
    expect(verifyQr(docs.body.qr)).toBe(true);
    expect(verifyQr(docs.body.qr.replace(/.$/, 'x'))).toBe(false);
    expect(docs.body.flight.origin.terminal).toBe('T1');
    const other = await loggedInAgent();
    await other.get(`/api/bookings/${booking.bookingReference}/documents`).expect(404);
  });

  it('opens 48 h before and closes 60 min before departure; assigns seats; repeats show the same passes', async () => {
    const agent = await loggedInAgent();
    const early = await createFlight(soon(49));
    const { booking: b1 } = (await pay(agent, flightBooking(early, { travellers: [person('Asha', 'Rao')] })).expect(201)).body;
    expect((await agent.post(`/api/bookings/${b1.bookingReference}/check-in`).expect(409)).body.error.message).toMatch(/isn’t open yet/);

    const late = await createFlight(soon(0.9));
    const { booking: b2 } = (await pay(agent, flightBooking(late, { travellers: [person('Asha', 'Rao')] })).expect(201)).body;
    expect((await agent.post(`/api/bookings/${b2.bookingReference}/check-in`).expect(409)).body.error.code).toBe('CHECKIN_CLOSED');

    const ok = await createFlight(soon(20));
    const { booking } = (await pay(agent, flightBooking(ok, { travellers: [person('Asha', 'Rao'), { ...person('Ravi', 'Rao'), seat: '20C' }] })).expect(201)).body;
    const first = await agent.post(`/api/bookings/${booking.bookingReference}/check-in`).expect(200);
    const passes = first.body.passes;
    expect(passes).toHaveLength(2);
    expect(passes[1].seat).toBe('20C'); // chosen seats never move
    expect(passes[0].seat).toMatch(/^\d+[A-F]$/);
    expect(new Date(ok.departureTime) - new Date(passes[0].boardingTime)).toBe(45 * 60e3);
    const again = await agent.post(`/api/bookings/${booking.bookingReference}/check-in`).expect(200);
    expect(again.body.passes.map((p) => p.seat)).toEqual(passes.map((p) => p.seat));
    expect((await Flight.findById(ok._id)).seatMap.unavailableSeats).toContain(passes[0].seat);
  });

  it('bookings with an infant check in at the airport', async () => {
    const flight = await createFlight({ departureTime: new Date(Date.now() + 10 * 3600e3), arrivalTime: new Date(Date.now() + 12 * 3600e3) });
    const agent = await loggedInAgent();
    const { booking } = (await pay(agent, withParty(flight, travellers(person('Asha', 'Rao'), person('Baby', 'Rao', 'infant')))).expect(201)).body;
    expect((await agent.post(`/api/bookings/${booking.bookingReference}/check-in`).expect(409)).body.error.code).toBe('INFANT_AIRPORT_CHECKIN');
  });
});

