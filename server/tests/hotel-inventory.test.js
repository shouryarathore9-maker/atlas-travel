// Date-aware hotel inventory (one RoomInventory document per room type, rooms booked per night),
// date-range stop-sell, room counts that can't drop below bookings, and occupancy-based pricing.
import { describe, expect, it } from 'vitest';
import AuditLog from '../models/AuditLog.js';
import RoomInventory from '../models/RoomInventory.js';
import Supplier from '../models/Supplier.js';
import { defaultHotelRateCard, hotelStay } from '../services/pricing.js';
import { app, createHotel, futureDate, hotelBooking, loggedInAgent, pay, supplierWithManager } from './helpers.js';
import request from 'supertest';

const room = { name: 'Deluxe Room', occupancy: { adults: 2, children: 1 }, taxesAndFees: 720, roomsTotal: 1 };

describe('rooms per night', () => {
  it('a full night blocks only stays that include it; back-to-back stays share the room', async () => {
    const hotel = await createHotel({ roomTypes: [room] });
    const guest = await loggedInAgent();
    await pay(guest, hotelBooking(hotel, { checkIn: futureDate(5), checkOut: futureDate(7) })).expect(201);
    // Check-out day is free again for the next guest.
    await pay(guest, hotelBooking(hotel, { checkIn: futureDate(7), checkOut: futureDate(8) })).expect(201);
    // Before: fine; overlapping one night: sold out.
    await pay(guest, hotelBooking(hotel, { checkIn: futureDate(3), checkOut: futureDate(5) })).expect(201);
    const clash = await pay(guest, hotelBooking(hotel, { checkIn: futureDate(6), checkOut: futureDate(9) })).expect(400);
    expect(clash.body.error.code).toBe('SOLD_OUT');

    // Search and details follow the dates.
    const search = (checkIn, checkOut) => request(app).get('/api/hotels').query({ city: 'Delhi', checkIn, checkOut, adults: 1 });
    expect((await search(futureDate(6), futureDate(7))).body.results).toHaveLength(0);
    expect((await search(futureDate(9), futureDate(10))).body.results).toHaveLength(1);
    const detail = await request(app).get(`/api/hotels/${hotel._id}`).query({ checkIn: futureDate(6), checkOut: futureDate(9) }).expect(200);
    expect(detail.body.hotel.roomTypes[0].roomsAvailable).toBe(0);
  });

  it('two guests racing for the last room: exactly one wins', async () => {
    const hotel = await createHotel({ roomTypes: [room] });
    const [a, b] = await Promise.all([loggedInAgent(), loggedInAgent({ email: 'other@example.com' })]);
    const results = await Promise.all([pay(a, hotelBooking(hotel)), pay(b, hotelBooking(hotel))]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const inv = await RoomInventory.findOne({ hotelId: hotel._id }).lean();
    expect(Math.max(...Object.values(inv.booked))).toBe(1);
  });

  it('a traveller cancellation gives back exactly that stay’s nights', async () => {
    const hotel = await createHotel({ roomTypes: [{ ...room, roomsTotal: 3 }] });
    const guest = await loggedInAgent();
    const first = (await pay(guest, hotelBooking(hotel, { checkIn: futureDate(5), checkOut: futureDate(7) })).expect(201)).body.booking;
    await pay(guest, hotelBooking(hotel, { checkIn: futureDate(6), checkOut: futureDate(8) })).expect(201);
    await guest.patch(`/api/bookings/${first._id}/cancel`).expect(200);
    const inv = await RoomInventory.findOne({ hotelId: hotel._id }).lean();
    expect(inv.booked).toEqual({ [futureDate(5)]: 0, [futureDate(6)]: 1, [futureDate(7)]: 1 });
  });
});

describe('hotel manager: dates and room counts', () => {
  it('stops and resumes sales for a date range; existing reservations stay; audit-logged', async () => {
    const { supplier, agent } = await supplierWithManager('hotel');
    const guest = await loggedInAgent();
    const booked = (await pay(guest, hotelBooking({ _id: supplier.hotelId }, { checkIn: futureDate(10), checkOut: futureDate(11) })).expect(201)).body.booking;
    const body = { rooms: ['Deluxe Room'], from: futureDate(10), to: futureDate(12), stopped: true };
    await agent.post('/api/supplier/hotel/stop-sell').send({ ...body, to: futureDate(9) }).expect(400);
    await agent.post('/api/supplier/hotel/stop-sell').send({ ...body, rooms: ['Penthouse'] }).expect(400);
    await guest.post('/api/supplier/hotel/stop-sell').send(body).expect(403);
    const res = await agent.post('/api/supplier/hotel/stop-sell').send(body).expect(200);
    expect(res.body.hotel.roomTypes[0].nights.stopped).toEqual([{ from: futureDate(10), to: futureDate(12) }]);

    // New stays touching those nights are refused; others aren't; the booked guest keeps the room.
    const stopped = await pay(guest, hotelBooking({ _id: supplier.hotelId }, { checkIn: futureDate(12), checkOut: futureDate(14) })).expect(400);
    expect(stopped.body.error.code).toBe('NOT_ON_SALE');
    await pay(guest, hotelBooking({ _id: supplier.hotelId }, { checkIn: futureDate(13), checkOut: futureDate(14) })).expect(201);
    expect((await guest.get(`/api/bookings/${booked.bookingReference}`).expect(200)).body.booking.status).toBe('confirmed');

    await agent.post('/api/supplier/hotel/stop-sell').send({ ...body, from: futureDate(12), to: futureDate(12), stopped: false }).expect(200);
    await pay(guest, hotelBooking({ _id: supplier.hotelId }, { checkIn: futureDate(12), checkOut: futureDate(13) })).expect(201);
    expect(await AuditLog.countDocuments({ action: { $in: ['hotel.stop_sell_dates', 'hotel.resume_sell_dates'] } })).toBe(2);
  });

  it('can’t lower a room count below what is booked on an upcoming night', async () => {
    const { supplier, agent } = await supplierWithManager('hotel'); // Deluxe Room: 2 rooms
    const guest = await loggedInAgent();
    await pay(guest, hotelBooking({ _id: supplier.hotelId }, { rooms: 2, adults: 3 })).expect(201);
    const hotel = (await agent.get('/api/supplier/hotel').expect(200)).body.hotel;
    expect(hotel.roomTypes[0].nights.peak).toMatchObject({ booked: 2 });
    const input = (roomsTotal) => ({
      description: hotel.description || 'A calm courtyard hotel near Lodhi Garden.',
      amenities: [],
      photos: ['/images/seed/hotels/hotel-1.jpg'],
      salesStopped: false,
      roomTypes: [{ originalName: 'Deluxe Room', name: 'Deluxe Room', occupancy: { adults: 2, children: 1 }, bedType: 'King bed', amenities: [], breakfastIncluded: false, baseRate: 6000, taxesAndFees: 720, roomsTotal, salesStopped: false }],
    });
    const res = await agent.put('/api/supplier/hotel').send(input(1)).expect(409);
    expect(res.body.error.code).toBe('ROOMS_BOOKED');
    await agent.put('/api/supplier/hotel').send(input(4)).expect(200);
    expect((await RoomInventory.findOne({ hotelId: supplier.hotelId }).lean()).total).toBe(4);
  });
});

describe('occupancy pricing', () => {
  it('the occupancy rule raises a night’s price as the room type fills (pure)', () => {
    const card = defaultHotelRateCard({ baseRates: { Deluxe: 6000 } });
    const plan = card.ratePlans[0];
    const at = (occ) => hotelStay(card, { roomTypeName: 'Deluxe', checkIn: '2027-02-02', checkOut: '2027-02-03', now: Date.parse('2027-01-20T00:00:00Z'), ratePlan: plan, occupancy: { '2027-02-02': occ } }).perRoom;
    expect(at(0.1)).toBeLessThan(at(0.6));
    expect(at(0.6)).toBeLessThan(at(0.9));
    expect(at(0.9) / at(0.1)).toBeCloseTo(1.25, 1);
  });

  it('prices each night at its occupancy before the booking', async () => {
    const hotel = await createHotel({ roomTypes: [{ ...room, roomsTotal: 2 }] });
    const supplier = await Supplier.findById(hotel.supplierId);
    await Supplier.updateOne({ _id: supplier._id }, { $set: { 'rateCard.occupancy': defaultHotelRateCard({ baseRates: {} }).occupancy } });
    const guest = await loggedInAgent();
    const quote = async () => (await request(app).get(`/api/hotels/${hotel._id}`).query({ checkIn: futureDate(5), checkOut: futureDate(6) })).body.hotel.roomTypes[0].plans[0].perRoom;
    const empty = await quote();
    await pay(guest, hotelBooking(hotel, { checkIn: futureDate(5), checkOut: futureDate(6) })).expect(201); // 1 of 2 booked = 50%
    expect(await quote()).toBe(Math.round((empty * 1.1) / 50) * 50);
  });
});
