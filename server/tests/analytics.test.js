// Stage 7: the admin analytics dashboard and funnel events.
import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import Booking from '../models/Booking.js';
import DailyStat from '../models/DailyStat.js';
import Event from '../models/Event.js';
import Payment from '../models/Payment.js';
import { rollUpEvents } from '../services/analytics.js';
import { addDays, istMidnight, todayIstString } from '../utils/dates.js';
import { app, createFlight, loggedInAgent, supplierWithManager } from './helpers.js';

let seq = 0;
const daysAgo = (n, hour = 10) => new Date(istMidnight(addDays(todayIstString(), -n)).getTime() + hour * 3600e3);
function booking(supplierId, { created, type = 'hotel', total = 11000, discount = 0, funder, status = 'confirmed', ended = true, endedDaysAgo = 1, cancellation } = {}) {
  const end = ended ? daysAgo(endedDaysAgo) : daysAgo(-10);
  return {
    userId: new mongoose.Types.ObjectId(),
    supplierId,
    type,
    itemId: new mongoose.Types.ObjectId(),
    bookingReference: `ATAN${String(++seq).padStart(4, '0')}`,
    createdAt: created,
    travelDates: { start: new Date(end.getTime() - 2 * 864e5), end },
    itemSummary: type === 'flight' ? { title: 'Delhi → Mumbai', origin: 'DEL', destination: 'BOM' } : { title: 'Test Courtyard', destination: 'Delhi' },
    selection: { rooms: 1 },
    fareBreakdown: { base: 10000, seatCharges: 0, mealCharges: 0, breakfast: 0, infantFees: 0, discounts: discount, taxes: 1000, total: total - discount },
    offer: funder ? { title: 'Test offer', funder, amount: discount } : null,
    status,
    cancellation,
  };
}

describe('admin analytics', () => {
  it('computes the KPIs with the stated definitions and compares with the previous period', async () => {
    const { supplier } = await supplierWithManager('hotel');
    await Booking.insertMany(
      [
        booking(supplier._id, { created: daysAgo(5) }), // completed: commission 10% of 10,000
        booking(supplier._id, { created: daysAgo(6), discount: 1000, funder: 'platform' }),
        booking(supplier._id, { created: daysAgo(7), ended: false }), // not travelled: GBV, no revenue
        booking(supplier._id, { created: daysAgo(8), status: 'cancelled', cancellation: { by: 'supplier', cancelledAt: daysAgo(3), refundAmount: 11000, feeRetained: 0 } }),
        booking(supplier._id, { created: daysAgo(40), endedDaysAgo: 35 }), // previous period (31–60 days ago)
      ],
      { timestamps: false },
    );
    await Payment.create([
      { amount: 1, method: 'upi', status: 'success', transactionId: 'T1', timestamp: daysAgo(2) },
      { amount: 1, method: 'upi', status: 'failed', transactionId: 'T2', timestamp: daysAgo(2) },
    ]);

    const admin = await loggedInAgent({ role: 'admin' });
    const { body } = await admin.get('/api/admin/analytics').query({ range: '30' }).expect(200);
    expect(body.kpis.current).toMatchObject({ bookings: 4, gbv: 44000, netRevenue: 2000, avgBookingValue: 11000 });
    expect(body.kpis.current.takeRate).toBeCloseTo(2000 / 22000);
    expect(body.kpis.previous.bookings).toBe(1);
    expect(body.cancellations).toMatchObject({ rate: 0.25, supplier: 0.25, traveller: 0, refunds: 11000 });
    expect(body.payments).toMatchObject({ success: 1, failed: 1, successRate: 0.5 });
    expect(body.offers).toMatchObject({ redemptions: 1, discountPlatform: 1000, discountSupplier: 0 });
    expect(body.series).toHaveLength(30);
    expect(body.supply.topSuppliers[0].label).toBe('Test Courtyard');
    expect(body.leadTime.map((b) => b.label)).toEqual(['0–7 days', '8–30 days', '31–60 days', '61+ days']);

    // Filters: product and supplier.
    expect((await admin.get('/api/admin/analytics').query({ product: 'flight' }).expect(200)).body.kpis.current.bookings).toBe(0);
    const other = await supplierWithManager('airline');
    expect((await admin.get('/api/admin/analytics').query({ supplierId: String(other.supplier._id) }).expect(200)).body.kpis.current.bookings).toBe(0);
  });

  it('validates the range and is admin-only', async () => {
    const admin = await loggedInAgent({ role: 'admin' });
    const today = todayIstString();
    await admin.get('/api/admin/analytics').query({ range: 'custom', from: addDays(today, -200), to: today }).expect(400);
    await admin.get('/api/admin/analytics').query({ range: 'custom', from: addDays(today, -10), to: addDays(today, -20) }).expect(400);
    const custom = await admin.get('/api/admin/analytics').query({ range: 'custom', from: addDays(today, -90), to: today }).expect(200);
    expect(custom.body.range.bucketDays).toBe(7); // weekly buckets beyond a month
    const traveller = await loggedInAgent();
    await traveller.get('/api/admin/analytics').expect(403);
    await request(app).get('/api/admin/analytics').expect(401);
  });

  it('records funnel events from real requests and rolls finished days up', async () => {
    await createFlight();
    await request(app).get('/api/flights').query({ origin: 'DEL', destination: 'BOM', date: addDays(todayIstString(), 10) }).expect(200);
    await request(app).get('/api/flights').query({ origin: 'DEL', destination: 'MAA', date: addDays(todayIstString(), 10) }).expect(200);
    expect(await Event.countDocuments({ type: 'search' })).toBe(2);
    expect(await Event.countDocuments({ type: 'search', zeroResults: true })).toBe(1);

    const admin = await loggedInAgent({ role: 'admin' });
    const live = (await admin.get('/api/admin/analytics').query({ range: '7' }).expect(200)).body.funnel;
    expect(live).toMatchObject({ searches: 2, zeroResults: 1 });

    // Yesterday's events become a permanent summary, once.
    await Event.updateMany({}, { $set: { at: daysAgo(1) } });
    expect(await rollUpEvents()).toBeGreaterThanOrEqual(2); // days without events get zero summaries too
    expect(await rollUpEvents()).toBe(0);
    expect(await DailyStat.findOne({ date: addDays(todayIstString(), -1), product: 'flight' }).lean()).toMatchObject({ searches: 2, zeroResults: 1 });
  });
});
