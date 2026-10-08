// Stage 4: supplier cancellations and reschedules, hotel cancellations, help tickets, admin bookings.
import { describe, expect, it } from 'vitest';
import AuditLog from '../models/AuditLog.js';
import Booking from '../models/Booking.js';
import Flight from '../models/Flight.js';
import Hotel from '../models/Hotel.js';
import Notification from '../models/Notification.js';
import Offer from '../models/Offer.js';
import { runDailyJob } from '../services/dailyJob.js';
import { BATCH_SIZE } from '../services/supplierCancellation.js';
import { createFlight, flightBooking, hotelBooking, loggedInAgent, pay, person, supplierWithManager } from './helpers.js';

async function bookedDeparture(count = 3) {
  const { supplier, agent: manager } = await supplierWithManager('airline');
  const flight = await createFlight({ supplierId: supplier._id, cabins: { economy: { capacity: 150, sold: 0 }, business: { capacity: 4, sold: 0 } } });
  const travellers = [];
  for (let i = 0; i < count; i++) {
    const agent = await loggedInAgent();
    const { booking } = (await pay(agent, flightBooking(flight, { travellers: [{ ...person('Asha', `Rao${'abcdefghijklmnopqrstuvwxyz'[i % 26]}${i}`.replace(/\d/g, '')), seat: '' }] })).expect(201)).body;
    travellers.push({ agent, booking });
  }
  return { supplier, manager, flight, travellers };
}

describe('airline cancels a departure (workflow 6)', () => {
  it('refunds every booking in full, tells travellers, restores offers, and logs one audit entry with the count', async () => {
    const { manager, flight, travellers } = await bookedDeparture(3);
    const offer = await Offer.create({ slug: 'x', code: 'TEST10', title: 'Test', summary: 's', funder: 'platform', scope: 'both', discountType: 'flat', value: 100, validFrom: '2020-01-01', validTo: '2099-01-01', redemptions: 1 });
    await Booking.updateOne({ _id: travellers[0].booking._id }, { $set: { offer: { offerId: offer._id, code: 'TEST10', title: 'Test', amount: 100, funder: 'platform' } } });

    const detail = await manager.get(`/api/supplier/departures/${flight._id}`).expect(200);
    expect(detail.body.affected.bookings).toBe(3);
    const res = await manager.post(`/api/supplier/departures/${flight._id}/cancel`).send({ reason: 'Aircraft unavailable' }).expect(200);
    expect(res.body).toMatchObject({ bookingsRefunded: 3, finished: true });

    for (const { booking } of travellers) {
      const b = await Booking.findById(booking._id).lean();
      expect(b.status).toBe('cancelled');
      expect(b.cancellation).toMatchObject({ by: 'supplier', refundAmount: booking.fareBreakdown.total, feeRetained: 0 });
    }
    expect((await Offer.findById(offer._id)).redemptions).toBe(0);
    expect(await Notification.countDocuments({ type: 'booking.cancelled_by_supplier' })).toBe(3);
    const log = await AuditLog.find({ action: 'departure.cancel' }).lean();
    expect(log).toHaveLength(1);
    expect(log[0].count).toBe(3);
    // It can't be booked any more, and running again changes nothing.
    await pay(travellers[0].agent, flightBooking(flight, { travellers: [person('New', 'Person')] })).expect(400);
    await manager.post(`/api/supplier/departures/${flight._id}/cancel`).send({ reason: 'again' }).expect(409);
  });

  it('an interrupted cancellation is finished by the daily job without double refunds', async () => {
    const { flight, travellers } = await bookedDeparture(2);
    await Flight.updateOne({ _id: flight._id }, { $set: { status: 'cancelled', cancellationJob: { state: 'pending', reason: 'Weather', startedAt: new Date(), processed: 0 } } });
    // One booking was already refunded before the crash.
    await Booking.updateOne({ _id: travellers[0].booking._id }, { $set: { status: 'cancelled', cancellation: { by: 'supplier', refundAmount: 1, receiptNo: 'RFOLD' } } });
    const result = await runDailyJob();
    expect(result.results.cancellations).toBe(1);
    expect((await Booking.findById(travellers[0].booking._id)).cancellation.receiptNo).toBe('RFOLD');
    expect((await Flight.findById(flight._id)).cancellationJob.state).toBe('done');
  });

  it('works in batches of 50', () => {
    expect(BATCH_SIZE).toBe(50);
  });
});

describe('airline reschedules (workflows 7 and 28)', () => {
  it('moves the time, notifies travellers, and lets them keep it or cancel for a full refund', async () => {
    const { manager, flight, travellers } = await bookedDeparture(2);
    const newTime = new Date(new Date(flight.departureTime).getTime() + 3 * 3600e3);
    const local = new Date(newTime.getTime() + 5.5 * 3600e3).toISOString().slice(0, 16);
    const res = await manager.post(`/api/supplier/departures/${flight._id}/reschedule`).send({ departureTime: local }).expect(200);
    expect(res.body.affected).toBe(2);
    expect(new Date(res.body.respondBy).getTime()).toBe(newTime.getTime() - 24 * 3600e3);

    const [a, b] = travellers;
    await a.agent.post(`/api/bookings/${a.booking.bookingReference}/reschedule-response`).send({ decision: 'keep' }).expect(200);
    const cancelled = await b.agent.post(`/api/bookings/${b.booking.bookingReference}/reschedule-response`).send({ decision: 'cancel' }).expect(200);
    expect(cancelled.body.booking.cancellation.refundAmount).toBe(b.booking.fareBreakdown.total); // Saver would normally charge a fee
    await b.agent.post(`/api/bookings/${b.booking.bookingReference}/reschedule-response`).send({ decision: 'keep' }).expect(409);
    expect((await Booking.findById(a.booking._id)).travelDates.start.getTime()).toBe(newTime.getTime());

    const tooFar = new Date(new Date(flight.departureTime).getTime() + 30 * 3600e3);
    await manager.post(`/api/supplier/departures/${flight._id}/reschedule`).send({ departureTime: new Date(tooFar.getTime() + 5.5 * 3600e3).toISOString().slice(0, 16) }).expect(400);
  });

  it('unanswered changes are kept once the deadline passes', async () => {
    const { manager, flight, travellers } = await bookedDeparture(1);
    const local = new Date(new Date(flight.departureTime).getTime() + 2 * 3600e3 + 5.5 * 3600e3).toISOString().slice(0, 16);
    await manager.post(`/api/supplier/departures/${flight._id}/reschedule`).send({ departureTime: local }).expect(200);
    await runDailyJob({ now: Date.now() + 15 * 24 * 3600e3 });
    expect((await Booking.findById(travellers[0].booking._id)).reschedule.decision).toBe('kept');
  });
});

describe('hotel cancels a reservation (workflow 8)', () => {
  it('refunds the guest in full and returns the rooms; only future check-ins; other hotels get 404', async () => {
    const { supplier, agent: manager } = await supplierWithManager('hotel');
    const traveller = await loggedInAgent();
    const { booking } = (await pay(traveller, hotelBooking({ _id: supplier.hotelId }, { ratePlan: 'nonrefundable' })).expect(201)).body;
    const { agent: other } = await supplierWithManager('hotel', { name: 'Other Hotel' });
    await other.post(`/api/supplier/reservations/${booking._id}/cancel`).send({ reason: 'Overbooked' }).expect(404);
    await manager.post(`/api/supplier/reservations/${booking._id}/cancel`).send({ reason: 'no' }).expect(400); // reason too short
    const res = await manager.post(`/api/supplier/reservations/${booking._id}/cancel`).send({ reason: 'Water leak in the room block' }).expect(200);
    expect(res.body.booking.cancellation).toMatchObject({ by: 'supplier', refundAmount: booking.fareBreakdown.total }); // even non-refundable
    expect((await Hotel.findById(supplier.hotelId)).roomTypes[0].roomsAvailable).toBe(2);
    const list = await manager.get('/api/supplier/reservations').query({ when: 'all' }).expect(200);
    expect(list.body.items[0].status).toBe('cancelled');
  });
});

describe('help tickets (workflow 5)', () => {
  it('traveller → admin → supplier → traveller, with statuses and scoping', async () => {
    const { supplier, agent: manager } = await supplierWithManager('airline');
    const flight = await createFlight({ supplierId: supplier._id });
    const traveller = await loggedInAgent();
    const { booking } = (await pay(traveller, flightBooking(flight)).expect(201)).body;
    const admin = await loggedInAgent({ role: 'admin' });

    const created = await traveller.post('/api/me/tickets').send({ bookingReference: booking.bookingReference, message: 'My seat shows twice on the e-ticket.' }).expect(201);
    const id = created.body.ticket._id;
    await traveller.post('/api/me/tickets').send({ bookingReference: booking.bookingReference, message: 'Another ticket for the same booking' }).expect(409);
    const stranger = await loggedInAgent();
    await stranger.get(`/api/me/tickets/${id}`).expect(404);
    await manager.get(`/api/supplier/tickets/${id}`).expect(404); // not escalated yet

    await admin.post(`/api/admin/tickets/${id}/escalate`).send({}).expect(200);
    const { agent: otherAirline } = await supplierWithManager('airline', { name: 'SpiceJet', code: 'SG' });
    await otherAirline.get(`/api/supplier/tickets/${id}`).expect(404);
    await manager.post(`/api/supplier/tickets/${id}/messages`).send({ message: 'Fixed — please re-open your e-ticket.' }).expect(200);
    let t = (await traveller.get(`/api/me/tickets/${id}`)).body.ticket;
    expect(t.status).toBe('answered');
    expect(t.messages.map((m) => m.authorRole)).toEqual(['traveller', 'supplier']);

    await traveller.post(`/api/me/tickets/${id}/messages`).send({ message: 'Thanks!' }).expect(200);
    await admin.post(`/api/admin/tickets/${id}/close`).expect(200);
    t = (await traveller.get(`/api/me/tickets/${id}`)).body.ticket;
    expect(t).toMatchObject({ status: 'closed', canReply: false });
    await traveller.post(`/api/me/tickets/${id}/messages`).send({ message: 'One more thing' }).expect(409);
    expect(await AuditLog.countDocuments({ action: /^ticket\./ })).toBe(3);
  });

  it('messages are stored as plain text', async () => {
    const flight = await createFlight();
    const traveller = await loggedInAgent();
    const { booking } = (await pay(traveller, flightBooking(flight)).expect(201)).body;
    const body = '<img src=x onerror=alert(1)> please help';
    const res = await traveller.post('/api/me/tickets').send({ bookingReference: booking.bookingReference, message: body }).expect(201);
    expect(res.body.ticket.messages[0].body).toBe(body); // stored verbatim; the client renders text, never HTML
  });
});

describe('admin bookings (workflow 31)', () => {
  it('finds any booking by reference or email, read-only', async () => {
    const flight = await createFlight();
    const traveller = await loggedInAgent();
    const { booking } = (await pay(traveller, flightBooking(flight)).expect(201)).body;
    const admin = await loggedInAgent({ role: 'admin' });
    expect((await admin.get('/api/admin/bookings').query({ q: booking.bookingReference }).expect(200)).body.total).toBe(1);
    expect((await admin.get('/api/admin/bookings').query({ q: 'priya@example.com' }).expect(200)).body.total).toBe(1);
    const detail = await admin.get(`/api/admin/bookings/${booking.bookingReference}`).expect(200);
    expect(detail.body.payments).toHaveLength(1);
    await admin.patch(`/api/bookings/${booking._id}/cancel`).expect(404); // admin can't cancel or refund
    await traveller.get('/api/admin/bookings').expect(403);
  });
});
